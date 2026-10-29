import {
  ACTION_TYPES,
  FIELD_TYPES,
  FOLLOW_CHANGES,
  IMPORT_PROBLEMS,
  PLAN_STATES,
  createAccount,
  followChangeMatches,
  importExport,
  mergeRenamed,
  parseFollowersJson,
  parseFollowingJson,
  parseMaster,
  stringifyMasterFile,
  toMasterFile,
  type ExportBundle,
  type ImportResult,
  type Master,
} from '../index.ts';

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

test('an account only I follow is never suggested (it shows in I unfollowed)', () => {
  const result = importExport(
    first(),
    bundle(
      [
        ['alice', 101],
        ['bob_new', 102],
      ],
      [
        ['alice', 201],
        ['carol', 203],
      ],
    ),
    T2,
  );
  expect(suggestions(result)).toEqual({});
});

test('plans on a renamed account are remembered and not reported as done', () => {
  const raw = first(master => {
    must(master.accounts.alice).toUnfollow = PLAN_STATES.PLANNED;
    must(master.accounts.alice).toRemove = PLAN_STATES.DONE;
    must(master.accounts.bob).toUnfollow = PLAN_STATES.PLANNED;
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
  expect(result.summary.plans.completed).toEqual({ [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 }); // only bob's unfollow
  expect(result.master.accounts.alice?.toUnfollow).toBeUndefined();
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

test('confirming moves tags, notes, reviewed and plans to the new name', () => {
  const target = createAccount('alice_new');
  target.following = { since: 101 };
  target.followedBy = { since: 201 };
  target.review.tags = ['friend'];
  target.review.notes = 'new note';
  const old = createAccount('alice');
  old.review = { reviewed: true, unavailable: true, tags: ['artist', 'friend'], notes: 'old note' };
  old.renameSuggestion = { to: 'alice_new', plans: [UNFOLLOW, REMOVE_FOLLOWER] };

  mergeRenamed(target, old);
  expect(target.review).toEqual({
    reviewed: true,
    unavailable: false,
    tags: ['friend', 'artist'],
    notes: 'new note · old note',
  });
  expect(target.toUnfollow).toBe(PLAN_STATES.PLANNED);
  expect(target.toRemove).toBe(PLAN_STATES.PLANNED);

  const followerOnly = createAccount('carol_2');
  followerOnly.followedBy = { since: 203 };
  const carol = createAccount('carol');
  carol.renameSuggestion = { to: 'carol_2', plans: [UNFOLLOW] };
  mergeRenamed(followerOnly, carol);
  expect(followerOnly.toUnfollow).toBeUndefined(); // I don't follow the new name: nothing to unfollow
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
