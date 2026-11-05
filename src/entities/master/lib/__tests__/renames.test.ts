import { createAccount } from '../account.ts';
import { planOf } from '../decision.ts';
import { FIELD_TYPES, IMPORT_PROBLEMS } from '../importProblems.ts';
import { parseMaster, stringifyMasterFile, toMasterFile } from '../masterFile.ts';
import { importExport, type ExportBundle, type ImportResult } from '../merge.ts';
import { parseFollowersJson, parseFollowingJson } from '../parse.ts';
import { mergeRenamed } from '../renames.ts';
import { followChangeMatches } from '../scopes.ts';
import { ACTION_TYPES, DecisionKind, FOLLOW_CHANGES, PLAN_STATES, type Master } from '../types.ts';

import { followersFile, followingFile, must, problemOf } from './helpers.ts';

const T1 = '2026-10-01T10:00:00.000Z';
const T2 = '2026-10-20T10:00:00.000Z';
const T3 = '2026-10-25T10:00:00.000Z';
const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;

type Entries = [string, number][];
const bundle = (following: Entries, followers: Entries): ExportBundle => ({
  following: parseFollowingJson(followingFile(...following)),
  followers: parseFollowersJson(followersFile(...followers)),
  followerFileCount: 1,
});
const asFile = (master: Master): unknown => JSON.parse(stringifyMasterFile(toMasterFile(master)));

/** Account key → open rename suggestion, for every account that has one. */
function suggestions({ master }: ImportResult) {
  return Object.fromEntries(
    Object.entries(master.accounts).flatMap(([key, a]) => (a.renameSuggestion ? [[key, a.renameSuggestion]] : [])),
  );
}

/** First import: alice (mutual), bob (I follow), carol (follows me), each with its own dates. */
function first(edit: (master: Master) => void = () => undefined): unknown {
  const { master } = importExport(
    null,
    bundle(
      [
        ['alice', 101],
        ['bob', 102],
      ],
      [
        ['alice', 201],
        ['carol', 203],
      ],
    ),
    T1,
  );
  edit(master);
  return asFile(master);
}

/** carol renamed to carol_2 (same follower date). */
const carolRenamed = () =>
  bundle(
    [
      ['alice', 101],
      ['bob', 102],
    ],
    [
      ['alice', 201],
      ['carol_2', 203],
    ],
  );

test('a mutual account that renamed is matched by both follow dates', () => {
  const result = importExport(
    first(),
    bundle(
      [
        ['alice_new', 101],
        ['bob', 102],
      ],
      [
        ['alice_new', 201],
        ['carol', 203],
      ],
    ),
    T2,
  );
  expect(suggestions(result)).toEqual({ alice: { to: 'alice_new', plans: [] } });
});

test('an account that only follows me is matched by its follower date', () => {
  expect(suggestions(importExport(first(), carolRenamed(), T2))).toEqual({ carol: { to: 'carol_2', plans: [] } });
});

test('no suggestion when a date differs, the follow directions differ, or a date is unknown', () => {
  const otherDate = importExport(
    first(),
    bundle(
      [
        ['alice', 101],
        ['bob', 102],
      ],
      [
        ['alice', 201],
        ['carol_2', 999],
      ],
    ),
    T2,
  );
  expect(suggestions(otherDate)).toEqual({});

  // alice was mutual; the new name only follows me (same follower date).
  const oneWay = importExport(
    first(),
    bundle(
      [['bob', 102]],
      [
        ['alice_new', 201],
        ['carol', 203],
      ],
    ),
    T2,
  );
  expect(suggestions(oneWay)).toEqual({});

  const noDates = (names: string[]): ExportBundle => ({
    following: [{ username: 'me', since: 1 }],
    followers: names.map(username => ({ username, since: null })),
    followerFileCount: 1,
  });
  const { master } = importExport(null, noDates(['dana']), T1);
  expect(suggestions(importExport(asFile(master), noDates(['dana_2']), T2))).toEqual({});
});

test('no suggestion when two accounts share the dates', () => {
  const { master } = importExport(
    null,
    bundle(
      [['me', 1]],
      [
        ['dana', 300],
        ['erin', 300],
      ],
    ),
    T1,
  );
  expect(suggestions(importExport(asFile(master), bundle([['me', 1]], [['new_one', 300]]), T2))).toEqual({});
});

test('an account that stopped following me but that I still follow is no rename', () => {
  const result = importExport(
    first(),
    bundle(
      [
        ['alice', 101],
        ['bob', 102],
      ],
      [
        ['alice_new', 201],
        ['carol', 203],
      ],
    ),
    T2,
  );
  expect(suggestions(result)).toEqual({});
});

/** bob (only I follow him) renamed to bob_new (same following date). */
const bobRenamed = (
  followers: Entries = [
    ['alice', 201],
    ['carol', 203],
  ],
) =>
  bundle(
    [
      ['alice', 101],
      ['bob_new', 102],
    ],
    followers,
  );

test('an account only I follow is matched by its following date', () => {
  expect(suggestions(importExport(first(), bobRenamed(), T2))).toEqual({ bob: { to: 'bob_new', plans: [] } });
});

test('a following date never matches a follower date', () => {
  // bob (only I follow him, since 102) is gone; a new follower has 102 as its follower date.
  const result = importExport(
    first(),
    bundle(
      [['alice', 101]],
      [
        ['alice', 201],
        ['carol', 203],
        ['bob_new', 102],
      ],
    ),
    T2,
  );
  expect(suggestions(result)).toEqual({});
});

test('an open suggestion on an account only I followed stays while I follow the new name', () => {
  const second = asFile(importExport(first(), bobRenamed(), T2).master);
  expect(suggestions(importExport(second, bobRenamed(), T3))).toEqual({ bob: { to: 'bob_new', plans: [] } });
  const unfollowedNewName = importExport(
    second,
    bundle(
      [['alice', 101]],
      [
        ['alice', 201],
        ['carol', 203],
      ],
    ),
    T3,
  );
  expect(suggestions(unfollowedNewName)).toEqual({});
});

test('plans on a renamed account are remembered and not reported as done', () => {
  const raw = first(master => {
    must(master.accounts.alice).decision = {
      kind: DecisionKind.QUEUED,
      plans: { unfollow: PLAN_STATES.PLANNED, removeFollower: PLAN_STATES.DONE },
    };
    must(master.accounts.bob).decision = { kind: DecisionKind.QUEUED, plans: { unfollow: PLAN_STATES.PLANNED } };
  });
  const result = importExport(
    raw,
    bundle(
      [['alice_new', 101]],
      [
        ['alice_new', 201],
        ['carol', 203],
      ],
    ),
    T2,
  );
  expect(suggestions(result)).toEqual({ alice: { to: 'alice_new', plans: [UNFOLLOW, REMOVE_FOLLOWER] } });
  expect(result.plans.completed).toEqual({ [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 }); // only bob's unfollow
  expect(planOf(must(result.master.accounts.alice), UNFOLLOW)).toBeUndefined();
});

test('an open suggestion is saved in the master, read back, and kept in Lost followers until decided', () => {
  const second = importExport(first(), carolRenamed(), T2);
  const saved = asFile({ ...second.master, lastSavedAt: T2 }) as { accounts: Record<string, unknown> };
  expect(saved.accounts.carol).toMatchObject({ renameSuggestion: { to: 'carol_2' } }); // no empty "plans"

  const third = importExport(saved, carolRenamed(), T3); // same export again, after the save
  expect(suggestions(third)).toEqual({ carol: { to: 'carol_2', plans: [] } });
  expect(followChangeMatches(must(third.master.accounts.carol), FOLLOW_CHANGES.LOST_FOLLOWERS, T2)).toBe(true);
});

test('a later import drops a suggestion that no longer holds', () => {
  const second = asFile(importExport(first(), carolRenamed(), T2).master);
  const carolBack = importExport(
    second,
    bundle(
      [
        ['alice', 101],
        ['bob', 102],
      ],
      [
        ['alice', 201],
        ['carol', 203],
        ['carol_2', 203],
      ],
    ),
    T3,
  );
  expect(suggestions(carolBack)).toEqual({});
  const newNameGone = importExport(
    second,
    bundle(
      [
        ['alice', 101],
        ['bob', 102],
      ],
      [['alice', 201]],
    ),
    T3,
  );
  expect(suggestions(newNameGone)).toEqual({});
});

test('a suggestion in the file is read strictly', () => {
  const raw = asFile(importExport(first(), carolRenamed(), T2).master) as {
    accounts: Record<string, Record<string, unknown>>;
  };
  must(raw.accounts.carol).renameSuggestion = { to: 'carol_2', plans: ['follow'] };
  expect(problemOf(() => parseMaster(raw))).toEqual({
    kind: IMPORT_PROBLEMS.INVALID_FIELD,
    path: 'accounts.carol.renameSuggestion.plans[0]',
    expected: FIELD_TYPES.ONE_OF,
    options: [UNFOLLOW, REMOVE_FOLLOWER],
  });
  must(raw.accounts.carol).renameSuggestion = { to: 'carol_2', why: 'dates' };
  expect(problemOf(() => parseMaster(raw))).toEqual({
    kind: IMPORT_PROBLEMS.UNKNOWN_FIELD,
    path: 'accounts.carol.renameSuggestion.why',
  });
});

test('confirming moves tags, notes, the decision and plans to the new name', () => {
  const target = createAccount('alice_new');
  target.following = { since: 101 };
  target.followedBy = { since: 201 };
  target.review.tags = ['friend'];
  target.review.notes = 'new note';
  const old = createAccount('alice');
  old.decision = { kind: DecisionKind.KEPT }; // its plans were cleared by the import and kept on the suggestion
  old.review = { unavailable: true, tags: ['artist', 'friend'], notes: 'old note' };
  old.renameSuggestion = { to: 'alice_new', plans: [UNFOLLOW, REMOVE_FOLLOWER] };

  mergeRenamed(target, old);
  expect(target.review).toEqual({
    unavailable: false,
    tags: ['friend', 'artist'],
    notes: 'new note · old note',
  });
  expect(target.decision).toEqual({
    kind: DecisionKind.QUEUED,
    plans: { unfollow: PLAN_STATES.PLANNED, removeFollower: PLAN_STATES.PLANNED },
  });

  const followerOnly = createAccount('carol_2');
  followerOnly.followedBy = { since: 203 };
  const carol = createAccount('carol');
  carol.renameSuggestion = { to: 'carol_2', plans: [UNFOLLOW] };
  mergeRenamed(followerOnly, carol);
  expect(planOf(followerOnly, UNFOLLOW)).toBeUndefined(); // I don't follow the new name: nothing to unfollow
  expect(followerOnly.decision).toBeUndefined(); // carol was undecided, so the new name still needs a decision
});

test("confirming carries the old name's decision over when the new name has none", () => {
  const target = createAccount('dave_new');
  const old = createAccount('dave');
  old.decision = { kind: DecisionKind.KEPT };
  mergeRenamed(target, old);
  expect(target.decision).toEqual({ kind: DecisionKind.KEPT });

  const decided = createAccount('erin_new');
  decided.followedBy = { since: 1 };
  decided.decision = { kind: DecisionKind.QUEUED, plans: { removeFollower: PLAN_STATES.PLANNED } };
  mergeRenamed(decided, old);
  expect(decided.decision.kind).toBe(DecisionKind.QUEUED); // the new name's own decision wins
});

test('confirming with only one note keeps it as it is', () => {
  const onlyOld = createAccount('bob_new');
  const bob = createAccount('bob');
  bob.review.notes = 'old note';
  mergeRenamed(onlyOld, bob);
  expect(onlyOld.review.notes).toBe('old note');

  const onlyNew = createAccount('dave_new');
  onlyNew.review.notes = 'new note';
  mergeRenamed(onlyNew, createAccount('dave'));
  expect(onlyNew.review.notes).toBe('new note');
});
