import { planStats } from '../actions.ts';
import { followExists, planOf, decisionMatches } from '../decision.ts';
import { FIELD_TYPES, IMPORT_PROBLEMS, type FieldType } from '../importProblems.ts';
import { parseBackupMeta, parseMaster, stringifyMasterFile, toMasterFile } from '../masterFile.ts';
import { importExport, type ExportBundle, type ImportResult } from '../merge.ts';
import { parseFollowersJson, parseFollowingJson } from '../parse.ts';
import { createReview } from '../review.ts';
import {
  followChangeCounts,
  followChangeMatches,
  relationshipOf,
  relationshipStats,
  scopeMatches,
  tagMatches,
} from '../scopes.ts';
import { buildSessionDiff } from '../sessionDiff.ts';
import {
  ACTION_TYPES,
  DecisionFilter,
  DecisionKind,
  FOLLOW_CHANGES,
  PLAN_STATES,
  RELATIONSHIPS,
  REVIEW_SCOPES,
  TAG_FILTER_KINDS,
  type Decision,
  type Master,
  type Plans,
} from '../types.ts';

import { deepFreeze, followersFile, followingFile, must, problemOf } from './helpers.ts';

const T1 = '2026-10-01T10:00:00.000Z';
const T2 = '2026-10-20T10:00:00.000Z';
const T3 = '2026-10-25T10:00:00.000Z';
const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;

function bundle(
  following: ReturnType<typeof followingFile>,
  ...followerFiles: ReturnType<typeof followersFile>[]
): ExportBundle {
  return {
    following: parseFollowingJson(following),
    followers: followerFiles.flatMap(parseFollowersJson),
    followerFileCount: followerFiles.length,
  };
}

function freshMaster(): Master {
  return importExport(null, bundle(followingFile(['Alice'], ['bob']), followersFile(['alice'], ['carol'])), T1).master;
}

/** Master → saved file → JSON, as a later import would read it. */
const asFile = (master: Master): unknown => JSON.parse(stringifyMasterFile(toMasterFile(master)));

describe('read functions never write (safe on frozen Redux state)', () => {
  test('all selector-side helpers work on a deep-frozen master', () => {
    const master = freshMaster();
    must(master.accounts.alice).review.tags = ['artist'];
    must(master.accounts.bob).decision = { kind: DecisionKind.QUEUED, plans: { unfollow: PLAN_STATES.DONE } };
    must(master.accounts.bob).unfollowedMeSeenAt = T1;
    const frozen = deepFreeze(master);
    const alice = must(frozen.accounts.alice);

    expect(() => {
      relationshipOf(alice);
      scopeMatches(alice, REVIEW_SCOPES.MUTUAL);
      tagMatches(alice, { kind: TAG_FILTER_KINDS.TAG, tag: 'artist' });
      tagMatches(alice, { kind: TAG_FILTER_KINDS.UNTAGGED });
      decisionMatches(alice, DecisionFilter.NEEDS_DECISION);
      relationshipStats(frozen);
      planStats(frozen);
      planOf(alice, UNFOLLOW);
      followChangeMatches(alice, FOLLOW_CHANGES.NEW_FOLLOWS, T1);
      followChangeCounts(frozen, null);
      followExists(alice, REMOVE_FOLLOWER);
      buildSessionDiff(frozen.accounts, frozen.accounts);
    }).not.toThrow();
  });
});

describe('master file', () => {
  /** A saved master file as it comes out of JSON.parse, with one tagged account, a plan and a stopped follow. */
  function saved(): Record<string, unknown> & { accounts: Record<string, Record<string, unknown>> } {
    const master = freshMaster();
    must(master.accounts.bob).review = { unavailable: false, tags: ['artist'], notes: '' };
    must(master.accounts.bob).decision = { kind: DecisionKind.QUEUED, plans: { unfollow: PLAN_STATES.PLANNED } };
    must(master.accounts.carol).unfollowedSeenAt = T1;
    return asFile({ ...master, lastSavedAt: T2 }) as ReturnType<typeof saved>;
  }

  test('is compact: defaults and derivable fields are left out', () => {
    const file = saved();
    expect(file.accounts).toEqual({
      alice: { username: 'Alice', followingSince: 1_700_000_000, followerSince: 1_700_000_000 },
      bob: {
        username: 'bob',
        followingSince: 1_700_000_000,
        decision: { kind: DecisionKind.QUEUED, plans: { unfollow: PLAN_STATES.PLANNED } },
        review: { unavailable: false, tags: ['artist'], notes: '' },
      },
      carol: { username: 'carol', followerSince: 1_700_000_000, unfollowedSeenAt: T1 },
    });
    expect(file.lastImportAt).toBe(T1);
  });

  test('round-trips: parse then save gives the same file', () => {
    const file = saved();
    expect(asFile(parseMaster(file))).toEqual(file);
  });

  test('reading restores follows; the relationship is derived from them', () => {
    const master = parseMaster(saved());
    const alice = must(master.accounts.alice);
    expect(alice.following).toEqual({ since: 1_700_000_000 });
    expect(alice.followedBy).toEqual({ since: 1_700_000_000 });
    expect(relationshipOf(alice)).toBe(RELATIONSHIPS.MUTUAL);
    expect(relationshipOf(must(master.accounts.carol))).toBe(RELATIONSHIPS.FOLLOWS_YOU_ONLY);
    expect(alice.review).toEqual(createReview());
  });

  test('a follow without a known time is kept (since: null), not dropped', () => {
    const file = saved();
    must(file.accounts.carol).followingSince = null;
    expect(parseMaster(file).accounts.carol?.following).toEqual({ since: null });
  });

  test('rejects input that is not a master', () => {
    const notAMaster = { kind: IMPORT_PROBLEMS.NOT_A_MASTER };
    expect(problemOf(() => parseMaster(null))).toEqual(notAMaster);
    expect(problemOf(() => parseMaster([]))).toEqual(notAMaster);
    expect(problemOf(() => parseMaster({ following: [] }))).toEqual(notAMaster);
  });

  test('rejects other format versions', () => {
    expect(problemOf(() => parseMaster({ ...saved(), version: 2 }))).toEqual({
      kind: IMPORT_PROBLEMS.INCOMPATIBLE_VERSION,
    });
    expect(problemOf(() => parseMaster({ ...saved(), version: undefined }))).toEqual({
      kind: IMPORT_PROBLEMS.INCOMPATIBLE_VERSION,
    });
  });

  const invalid = (path: string, expected: FieldType) => ({ kind: IMPORT_PROBLEMS.INVALID_FIELD, path, expected });

  test("rejects a save or import time that isn't a date, since the change lists count from it", () => {
    expect(problemOf(() => parseMaster({ ...saved(), lastSavedAt: 'yesterday' }))).toEqual(
      invalid('lastSavedAt', FIELD_TYPES.DATE),
    );
    expect(problemOf(() => parseMaster({ ...saved(), lastImportAt: 'x' }))).toEqual(
      invalid('lastImportAt', FIELD_TYPES.DATE),
    );
  });

  test('names the exact field that is wrong instead of silently repairing it', () => {
    const raw = saved();
    (must(raw.accounts.bob).review as { tags: unknown }).tags = 'artist';
    expect(problemOf(() => parseMaster(raw))).toEqual(invalid('accounts.bob.review.tags', FIELD_TYPES.LIST));

    const raw2 = saved();
    must(raw2.accounts.bob).decision = { kind: DecisionKind.QUEUED, plans: { unfollow: true } };
    expect(problemOf(() => parseMaster(raw2))).toEqual({
      ...invalid('accounts.bob.decision.plans.unfollow', FIELD_TYPES.ONE_OF),
      options: ['planned', 'done'],
    });

    const raw3 = saved();
    must(raw3.accounts.carol).unfollowedSeenAt = 'last week';
    expect(problemOf(() => parseMaster(raw3))).toEqual(invalid('accounts.carol.unfollowedSeenAt', FIELD_TYPES.DATE));

    const raw4 = saved();
    must(raw4.accounts.alice).followingSince = 'yesterday';
    expect(problemOf(() => parseMaster(raw4))).toEqual(
      invalid('accounts.alice.followingSince', FIELD_TYPES.NUMBER_OR_NULL),
    );
  });

  test("rejects an account or review field it doesn't know instead of silently dropping it", () => {
    const raw = saved();
    must(raw.accounts.bob).plans = ['unfollow'];
    expect(problemOf(() => parseMaster(raw))).toEqual({
      kind: IMPORT_PROBLEMS.UNKNOWN_FIELD,
      path: 'accounts.bob.plans',
    });
    const raw2 = saved();
    (must(raw2.accounts.bob).review as Record<string, unknown>).rating = 5;
    expect(problemOf(() => parseMaster(raw2))).toEqual({
      kind: IMPORT_PROBLEMS.UNKNOWN_FIELD,
      path: 'accounts.bob.review.rating',
    });
  });

  test('reads and writes each decision: needs a decision, kept, queued', () => {
    const raw = saved();
    must(raw.accounts.alice).decision = { kind: DecisionKind.KEPT };
    const master = parseMaster(raw);
    expect(master.accounts.alice?.decision).toEqual({ kind: DecisionKind.KEPT });
    expect(master.accounts.bob?.decision).toEqual({
      kind: DecisionKind.QUEUED,
      plans: { unfollow: PLAN_STATES.PLANNED },
    });
    expect(master.accounts.carol?.decision).toBeUndefined();
    expect(asFile(master)).toEqual(raw);
  });

  test('rejects a decision that means nothing instead of guessing', () => {
    const withDecision = (decision: unknown) => {
      const raw = saved();
      must(raw.accounts.bob).decision = decision;
      return () => parseMaster(raw);
    };
    expect(problemOf(withDecision({ kind: 'maybe' }))).toEqual({
      ...invalid('accounts.bob.decision.kind', FIELD_TYPES.ONE_OF),
      options: ['kept', 'queued'],
    });
    expect(problemOf(withDecision({ kind: DecisionKind.QUEUED, plans: {} }))).toEqual(
      invalid('accounts.bob.decision.plans', FIELD_TYPES.NON_EMPTY_OBJECT),
    );
    expect(problemOf(withDecision({ kind: DecisionKind.KEPT, plans: { unfollow: 'planned' } }))).toEqual({
      kind: IMPORT_PROBLEMS.UNKNOWN_FIELD,
      path: 'accounts.bob.decision.plans',
    });
    expect(problemOf(withDecision({ kind: DecisionKind.QUEUED, plans: { block: 'planned' } }))).toEqual({
      kind: IMPORT_PROBLEMS.UNKNOWN_FIELD,
      path: 'accounts.bob.decision.plans.block',
    });
  });

  test('drops fields the app does not use', () => {
    const parsed = parseMaster({ ...saved(), notesFromElsewhere: 'x' });
    expect(Object.keys(toMasterFile(parsed))).toEqual(['version', 'lastSavedAt', 'lastImportAt', 'accounts']);
  });

  test('does not mutate its input', () => {
    const raw = saved();
    const before = JSON.stringify(raw);
    parseMaster(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  test('usernames that collide with Object.prototype members are ordinary accounts', () => {
    const raw = saved();
    const accounts = JSON.parse('{}') as Record<string, unknown>;
    for (const name of ['constructor', '__proto__', 'toString']) {
      Object.defineProperty(accounts, name, { value: { username: name }, enumerable: true });
    }
    const parsed = parseMaster({ ...raw, accounts });
    expect(Object.keys(parsed.accounts).sort()).toEqual(['__proto__', 'constructor', 'tostring']);
    const key: string = 'constructor';
    expect(parsed.accounts[key]?.username).toBe('constructor');

    const resaved = parseMaster(JSON.parse(stringifyMasterFile(toMasterFile(parsed))));
    expect(Object.keys(resaved.accounts).sort()).toEqual(['__proto__', 'constructor', 'tostring']);
  });

  test('rejects an account listed twice under different casing', () => {
    const raw = saved();
    raw.accounts.BOB = { ...raw.accounts.bob, username: 'BOB' };
    expect(problemOf(() => parseMaster(raw))).toEqual({ kind: IMPORT_PROBLEMS.DUPLICATE_ACCOUNT, username: 'BOB' });
  });
});

describe('backup meta', () => {
  const meta = () => ({
    revision: 3,
    savedRevision: -1,
    lastSavedAt: '2026-10-27T12:00:00Z',
    importFacts: {
      followingBefore: 2,
      followersBefore: 1,
      completedPlans: { bob: [ACTION_TYPES.UNFOLLOW] },
      previousImportAt: '2026-10-20T12:00:00Z',
    },
  });
  const invalid = (path: string, expected: FieldType) => ({ kind: IMPORT_PROBLEMS.INVALID_FIELD, path, expected });

  test('reads it back as stored; a field a past version wrote is ignored', () => {
    expect(parseBackupMeta(meta(), 'meta')).toEqual(meta());
    expect(parseBackupMeta({ ...meta(), storedAt: '2026-10-27T12:00:00Z' }, 'meta')).toEqual(meta());
    const neverSaved = { ...meta(), lastSavedAt: undefined };
    expect(parseBackupMeta(neverSaved, 'meta')).not.toHaveProperty('lastSavedAt');
  });

  test('rejects a missing or broken edit counter, which would make unsaved work look saved', () => {
    expect(problemOf(() => parseBackupMeta({ ...meta(), revision: undefined }, 'meta'))).toEqual(
      invalid('meta.revision', FIELD_TYPES.WHOLE_NUMBER),
    );
    expect(problemOf(() => parseBackupMeta({ ...meta(), savedRevision: 1.5 }, 'meta'))).toEqual(
      invalid('meta.savedRevision', FIELD_TYPES.WHOLE_NUMBER),
    );
    expect(problemOf(() => parseBackupMeta({ ...meta(), revision: '3' }, 'meta'))).toEqual(
      invalid('meta.revision', FIELD_TYPES.WHOLE_NUMBER),
    );
  });

  test('rejects a save time that is not a date, and broken import facts', () => {
    expect(problemOf(() => parseBackupMeta({ ...meta(), lastSavedAt: 'yesterday' }, 'meta'))).toEqual(
      invalid('meta.lastSavedAt', FIELD_TYPES.DATE),
    );
    expect(problemOf(() => parseBackupMeta({ ...meta(), importFacts: undefined }, 'meta'))).toEqual(
      invalid('meta.importFacts', FIELD_TYPES.OBJECT),
    );
    expect(problemOf(() => parseBackupMeta(null, 'meta'))).toEqual(invalid('meta', FIELD_TYPES.OBJECT));
    const firstImport = { ...meta(), importFacts: { ...meta().importFacts, previousImportAt: null } };
    expect(parseBackupMeta(firstImport, 'meta')).toEqual(firstImport);
    const noDate = { ...meta(), importFacts: { ...meta().importFacts, previousImportAt: undefined } };
    expect(problemOf(() => parseBackupMeta(noDate, 'meta'))).toEqual(
      invalid('meta.importFacts.previousImportAt', FIELD_TYPES.DATE),
    );
  });
});

describe('importExport', () => {
  /** Instagram follow date (seconds) just after T1, i.e. after the master below was saved. */
  const AFTER_T1 = Date.parse(T1) / 1000 + 60;
  const savedAtT1 = (master: Master) => asFile({ ...master, lastSavedAt: T1 });
  /** What changed since the previous import, as the Changes page counts it. */
  const changesOf = ({ master, facts }: ImportResult) => followChangeCounts(master, facts.previousImportAt);
  const changes = (newFollows: number, unfollowed: number, newFollowers: number, lostFollowers: number) => ({
    [FOLLOW_CHANGES.NEW_FOLLOWS]: newFollows,
    [FOLLOW_CHANGES.UNFOLLOWED]: unfollowed,
    [FOLLOW_CHANGES.NEW_FOLLOWERS]: newFollowers,
    [FOLLOW_CHANGES.LOST_FOLLOWERS]: lostFollowers,
  });

  test('first-time user: new master, everyone counts as new, nothing stopped', () => {
    const result = importExport(
      null,
      bundle(followingFile(['Alice', 100], ['bob', 200]), followersFile(['alice', 300]), followersFile(['carol', 400])),
      T1,
    );
    expect(result.isDirty).toBe(true);
    expect(result.master.lastImportAt).toBe(T1);
    expect(must(result.master.accounts.alice).following).toEqual({ since: 100 });
    expect(must(result.master.accounts.alice).followedBy).toEqual({ since: 300 });
    expect(relationshipOf(must(result.master.accounts.carol))).toBe(RELATIONSHIPS.FOLLOWS_YOU_ONLY);
    expect(
      Object.values(result.master.accounts).some(account => account.unfollowedSeenAt ?? account.unfollowedMeSeenAt),
    ).toBe(false);
    // Without a saved master everything counts as new, so follows aren't dated either.
    expect(
      Object.values(result.master.accounts).some(account => account.followedSeenAt ?? account.followedMeSeenAt),
    ).toBe(false);
    expect(changesOf(result)).toEqual(changes(2, 0, 2, 0));
  });

  test('re-importing the same export is not dirty and changes nothing', () => {
    const earlier = importExport(
      savedAtT1(freshMaster()),
      bundle(followingFile(['Alice']), followersFile(['alice'], ['dave', AFTER_T1])),
      T2,
    ).master;
    const result = importExport(
      asFile(earlier),
      bundle(followingFile(['Alice']), followersFile(['alice'], ['dave', AFTER_T1])),
      T3,
    );
    expect(result.hasExportChanged).toBe(false);
    expect(result.isDirty).toBe(false);
    expect(result.master.lastImportAt).toBe(T2);
    expect(toMasterFile(result.master)).toEqual(toMasterFile(earlier)); // same accounts (files hold no first-seen)
    expect(result.facts.previousImportAt).toBe(T2);
    expect(changesOf(result)).toEqual(changes(0, 0, 0, 0)); // nothing since the previous import
  });

  test('the same people with a re-dated follow count as a changed export', () => {
    const earlier = importExport(
      savedAtT1(freshMaster()),
      bundle(followingFile(['alice']), followersFile(['alice'])),
      T2,
    ).master;
    const result = importExport(
      asFile(earlier),
      bundle(followingFile(['alice', AFTER_T1]), followersFile(['alice'])),
      T3,
    );
    expect(result.hasExportChanged).toBe(true);
    expect(result.isDirty).toBe(true);
    expect(result.master.lastImportAt).toBe(T3);
    expect(must(result.master.accounts.alice).following).toEqual({ since: AFTER_T1 });
    expect(changesOf(result)[FOLLOW_CHANGES.NEW_FOLLOWS]).toBe(1); // followed again after the last save
  });

  test('a later export dates stopped follows and keeps review data', () => {
    const saved = freshMaster();
    must(saved.accounts.bob).decision = { kind: DecisionKind.KEPT };
    must(saved.accounts.bob).review = { unavailable: false, tags: ['artist'], notes: 'hi' };
    const result = importExport(
      savedAtT1(saved),
      bundle(followingFile(['alice']), followersFile(['alice'], ['dave', AFTER_T1])),
      T2,
    );

    expect(result.hasExportChanged).toBe(true);
    expect(changesOf(result)).toEqual(changes(0, 1, 1, 1));
    expect(result.master.accounts.bob?.unfollowedSeenAt).toBe(T2);
    expect(result.master.accounts.carol?.unfollowedMeSeenAt).toBe(T2);
    expect(result.master.accounts.alice?.unfollowedSeenAt).toBeUndefined();
    expect(relationshipOf(must(result.master.accounts.bob))).toBe(RELATIONSHIPS.NEITHER);
    expect(result.master.accounts.bob?.review.notes).toBe('hi');
    expect(result.master.accounts.alice?.username).toBe('alice'); // casing follows the newest export
    expect(result.master.lastImportAt).toBe(T2);
  });

  test('changes count from the previous import: what it already showed is not counted again', () => {
    const second = importExport(
      savedAtT1(freshMaster()),
      bundle(followingFile(['alice'], ['bob'], ['erin', AFTER_T1]), followersFile(['alice'])),
      T2,
    ).master;
    const third = importExport(
      asFile(second),
      bundle(followingFile(['alice'], ['erin', AFTER_T1], ['finn', AFTER_T1]), followersFile(['alice'])),
      T3,
    );
    expect(third.facts.previousImportAt).toBe(T2);
    expect(changesOf(third)).toEqual(changes(1, 1, 0, 0)); // finn new, bob unfollowed (erin and carol: shown at T2)
    const since = (key: string) =>
      followChangeMatches(must(third.master.accounts[key]), FOLLOW_CHANGES.NEW_FOLLOWS, T2);
    expect(since('erin')).toBe(false); // new in the previous import
    expect(since('finn')).toBe(true);
  });

  test('a follow made after the export was built but before the save still counts as new', () => {
    const BEFORE_T1 = Date.parse(T1) / 1000 - 3600; // missing from the export the saved master came from
    const result = importExport(
      savedAtT1(freshMaster()),
      bundle(
        followingFile(['alice'], ['bob'], ['erin', BEFORE_T1]),
        followersFile(['alice'], ['carol'], ['gina', BEFORE_T1]),
      ),
      T2,
    );
    expect(changesOf(result)).toEqual(changes(1, 0, 1, 0));
    expect(must(result.master.accounts.erin).followedSeenAt).toBe(T2);
    expect(must(result.master.accounts.gina).followedMeSeenAt).toBe(T2);
    expect(must(result.master.accounts.alice).followedSeenAt).toBeUndefined(); // already followed in the saved master
  });

  test("first-seen dates stay in the browser's copy, but a downloaded master holds none", () => {
    const sameExport = bundle(followingFile(['alice'], ['bob'], ['erin']), followersFile(['alice'], ['carol']));
    const { master: imported, facts } = importExport(savedAtT1(freshMaster()), sameExport, T2);
    // browser storage: keeps what Changes counts (after the previous import)
    expect(toMasterFile(imported, facts.previousImportAt).accounts.erin).toHaveProperty('followedSeenAt', T2);

    const downloaded = toMasterFile({ ...imported, lastSavedAt: T3 });
    expect(Object.values(downloaded.accounts).some(account => account.followedSeenAt ?? account.followedMeSeenAt)).toBe(
      false,
    );
    const next = importExport(JSON.parse(stringifyMasterFile(downloaded)), sameExport, T3);
    expect(changesOf(next)[FOLLOW_CHANGES.NEW_FOLLOWS]).toBe(0); // erin was new before that save, not after
  });

  test('a follow without a known date counts as new so it gets looked at', () => {
    const followingNoDate = { relationships_following: [{ title: 'zoe', string_list_data: [] }] };
    const result = importExport(savedAtT1(freshMaster()), bundle(followingNoDate, followersFile(['alice'])), T2);
    expect(followChangeMatches(must(result.master.accounts.zoe), FOLLOW_CHANGES.NEW_FOLLOWS, T1)).toBe(true);
  });

  test('following again clears the unfollow date', () => {
    const second = importExport(
      savedAtT1(freshMaster()),
      bundle(followingFile(['alice']), followersFile(['alice'])),
      T2,
    ).master;
    expect(second.accounts.bob?.unfollowedSeenAt).toBe(T2);
    const third = importExport(
      asFile(second),
      bundle(followingFile(['alice'], ['bob']), followersFile(['alice'], ['carol'])),
      T3,
    ).master;
    expect(third.accounts.bob?.unfollowedSeenAt).toBeUndefined();
    expect(third.accounts.carol?.unfollowedMeSeenAt).toBeUndefined();
  });

  test('plans are settled against the export and make the import dirty', () => {
    const saved = freshMaster();
    const queued = (plans: Plans): Decision => ({ kind: DecisionKind.QUEUED, plans });
    must(saved.accounts.bob).decision = queued({ unfollow: PLAN_STATES.DONE }); // really unfollowed
    must(saved.accounts.alice).decision = queued({ unfollow: PLAN_STATES.DONE }); // marked done, but still followed
    must(saved.accounts.carol).decision = queued({ removeFollower: PLAN_STATES.PLANNED }); // not done yet
    const same = bundle(followingFile(['Alice']), followersFile(['alice'], ['carol']));
    const result = importExport(savedAtT1(saved), same, T2);
    expect(result.plans).toEqual({
      completed: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 },
      reopened: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 },
    });
    // The Changes page's facts: counts in the master before this export, and whose plan was found done.
    expect(result.facts).toEqual({
      followingBefore: 2,
      followersBefore: 2,
      completedPlans: { bob: [UNFOLLOW] },
      previousImportAt: T1,
    });
    expect(planOf(must(result.master.accounts.bob), UNFOLLOW)).toBeUndefined();
    // Its only plan happened and bob doesn't follow you: nothing is left to decide.
    expect(result.master.accounts.bob?.decision).toBeUndefined();
    expect(planOf(must(result.master.accounts.alice), UNFOLLOW)).toBe(PLAN_STATES.PLANNED);
    expect(planOf(must(result.master.accounts.carol), REMOVE_FOLLOWER)).toBe(PLAN_STATES.PLANNED);
    expect(result.isDirty).toBe(true);
  });

  test('rejects exports with an empty side', () => {
    expect(problemOf(() => importExport(null, bundle(followingFile(), followersFile(['a'])), T1))).toEqual({
      kind: IMPORT_PROBLEMS.NO_FOLLOWING,
    });
    expect(problemOf(() => importExport(null, bundle(followingFile(['a'])), T1))).toEqual({
      kind: IMPORT_PROBLEMS.NO_FOLLOWERS,
    });
  });
});

describe('parsing', () => {
  test('following: username from title, missing timestamp → since null', () => {
    expect(
      parseFollowingJson({
        relationships_following: [
          { title: 'x', string_list_data: [{ href: 'https://www.instagram.com/_u/x' }] },
          { title: '' },
          null,
        ],
      }),
    ).toEqual([{ username: 'x', since: null }]);
  });

  test('followers: username from value, falls back to title', () => {
    expect(
      parseFollowersJson([
        { title: 't', string_list_data: [] },
        { string_list_data: [{ value: 'v', timestamp: 5 }] },
      ]).map(account => account.username),
    ).toEqual(['t', 'v']);
  });

  test('wrong shapes yield no accounts instead of throwing', () => {
    expect(parseFollowingJson('nope')).toEqual([]);
    expect(parseFollowersJson({ relationships_following: [] })).toEqual([]);
  });
});

describe('tag filter', () => {
  test("a real tag named 'untagged' is distinct from the Untagged filter", () => {
    const alice = must(freshMaster().accounts.alice);
    alice.review.tags = ['untagged'];
    expect(tagMatches(alice, { kind: TAG_FILTER_KINDS.TAG, tag: 'untagged' })).toBe(true);
    expect(tagMatches(alice, { kind: TAG_FILTER_KINDS.UNTAGGED })).toBe(false);
  });
});
