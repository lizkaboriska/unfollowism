// Review rules: scopes, decisions, plans and session changes.
import { planStats, settleDecisions } from '../actions.ts';
import { decisionMatches, isKept, keep, undecide, planOf, setPlan } from '../decision.ts';
import { dedupeAccounts, parseFollowersJson } from '../parse.ts';
import { relationshipStats, scopeMatches } from '../scopes.ts';
import { SESSION_CHANGES, TagChangeKind, buildSessionDiff, groupSessionChanges } from '../sessionDiff.ts';
import { ACTION_TYPES, DecisionFilter, DecisionKind, PLAN_STATES, REVIEW_SCOPES, type Account } from '../types.ts';

import { account, follows, must, stateWith } from './helpers.ts';

const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;
const { PLANNED, DONE } = PLAN_STATES;
const none = { [UNFOLLOW]: 0, [REMOVE_FOLLOWER]: 0 };
const accountsOf = (...items: Account[]) => stateWith(...items).accounts;

test('review scopes support overlapping following/follower views', () => {
  const mutual = follows(account('mutual'), { following: true, followedBy: true });
  const notBack = follows(account('notback'), { following: true });
  const followerOnly = follows(account('follower'), { followedBy: true });

  expect(scopeMatches(mutual, REVIEW_SCOPES.FOLLOWING)).toBe(true);
  expect(scopeMatches(mutual, REVIEW_SCOPES.FOLLOWERS)).toBe(true);
  expect(scopeMatches(mutual, REVIEW_SCOPES.MUTUAL)).toBe(true);
  expect(scopeMatches(notBack, REVIEW_SCOPES.FOLLOWING)).toBe(true);
  expect(scopeMatches(notBack, REVIEW_SCOPES.FOLLOWERS)).toBe(false);
  expect(scopeMatches(followerOnly, REVIEW_SCOPES.FOLLOWERS)).toBe(true);
  expect(scopeMatches(followerOnly, REVIEW_SCOPES.FOLLOWING)).toBe(false);
});

test('scope stats count every list, whichever one is shown', () => {
  const mutual = follows(account('mutual'), { following: true, followedBy: true });
  keep(mutual);
  const notBack = follows(account('notback'), { following: true });
  const followerOnly = follows(account('follower'), { followedBy: true });

  const state = stateWith(mutual, notBack, followerOnly);
  expect(relationshipStats(state)).toEqual({
    following: 2,
    followers: 2,
    mutual: 1,
    notFollowingBack: 1,
    followsYouOnly: 1,
    currentAccounts: 3,
  });
});

// A plan is cleared once the export no longer has the follow; a plan marked done that the
// export contradicts goes back to planned.
test('a planned unfollow is the decision, and is completed only once the follow is gone', () => {
  const user = follows(account(), { following: true });
  const state = stateWith(user);

  setPlan(user, UNFOLLOW, PLANNED);
  expect(planOf(user, UNFOLLOW)).toBe(PLANNED);
  expect(user.decision).toEqual({ kind: DecisionKind.QUEUED, plans: { unfollow: PLANNED } });

  expect(settleDecisions(state).plans).toEqual({ completed: none, reopened: none }); // still followed
  expect(planOf(user, UNFOLLOW)).toBe(PLANNED);

  follows(user, {});
  expect(settleDecisions(state).plans).toEqual({ completed: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 }, reopened: none });
  expect(planOf(user, UNFOLLOW)).toBeUndefined();
  expect(user.decision, 'nothing is left between you: no decision').toBeUndefined();
});

test('a done plan leaves the account Kept while you are still connected', () => {
  // A mutual: removed as a follower, still followed (the mixed case set in the popup).
  const user = follows(account(), { following: true, followedBy: true });
  setPlan(user, REMOVE_FOLLOWER, PLANNED);
  follows(user, { following: true });
  // Your removal is why they left: it doesn't count as them leaving.
  expect(settleDecisions(stateWith(user), { lostFollowers: new Set(['alice']) }).undecided).toBe(0);
  expect(user.decision).toEqual({ kind: DecisionKind.KEPT });
});

test('a Kept account that stops following you needs a decision again; one you unfollowed stays Kept', () => {
  const left = follows(account('left'), { following: true, followedBy: true });
  const unfollowed = follows(account('unfollowed'), { following: true, followedBy: true });
  keep(left);
  keep(unfollowed);
  follows(left, { following: true });
  follows(unfollowed, { followedBy: true });
  const settled = settleDecisions(stateWith(left, unfollowed), { lostFollowers: new Set(['left']) });
  expect(settled.undecided).toBe(1);
  expect(left.decision).toBeUndefined();
  expect(isKept(unfollowed)).toBe(true);
});

test('a queued plan stays when they stop following you', () => {
  const user = follows(account(), { following: true, followedBy: true });
  setPlan(user, UNFOLLOW, PLANNED);
  follows(user, { following: true });
  expect(settleDecisions(stateWith(user), { lostFollowers: new Set(['alice']) }).undecided).toBe(0);
  expect(planOf(user, UNFOLLOW)).toBe(PLANNED);
});

test('a past account loses its decision, unless it may be a rename', () => {
  const past = follows(account('past'), {});
  const renamed = follows(account('renamed'), {});
  keep(past);
  keep(renamed);
  renamed.renameSuggestion = { to: 'renamed_2', plans: [] };
  expect(settleDecisions(stateWith(past, renamed)).undecided).toBe(1);
  expect(past.decision).toBeUndefined();
  expect(isKept(renamed), 'kept to move to the new name').toBe(true);
});

test('past accounts match only the Any decision filter', () => {
  const past = follows(account(), {});
  for (const filter of Object.values(DecisionFilter)) {
    expect(decisionMatches(past, filter), filter).toBe(filter === DecisionFilter.ANY);
  }
});

test('remove follower is symmetric to unfollow', () => {
  const user = follows(account(), { followedBy: true });
  setPlan(user, REMOVE_FOLLOWER, PLANNED);
  follows(user, {});
  expect(settleDecisions(stateWith(user)).plans.completed).toEqual({ [UNFOLLOW]: 0, [REMOVE_FOLLOWER]: 1 });
  expect(planOf(user, REMOVE_FOLLOWER)).toBeUndefined();
});

test('a plan marked done that the export contradicts goes back to planned', () => {
  const user = follows(account(), { following: true });
  setPlan(user, UNFOLLOW, DONE);
  expect(settleDecisions(stateWith(user)).plans).toEqual({
    completed: none,
    reopened: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 },
  });
  expect(planOf(user, UNFOLLOW)).toBe(PLANNED);
});

test('a plan can be cancelled without affecting account review data', () => {
  const user = follows(account(), { following: true, followedBy: true });
  user.review.tags = ['artist'];
  setPlan(user, UNFOLLOW, PLANNED);
  setPlan(user, UNFOLLOW, undefined);
  expect(planOf(user, UNFOLLOW)).toBeUndefined();
  expect(user.decision, 'undoing the last plan: needs a decision again').toBeUndefined();
  expect(user.review.tags).toEqual(['artist']);
});

test("marking is idempotent and refuses actions the relationship doesn't allow", () => {
  const user = follows(account(), { following: true });
  setPlan(user, UNFOLLOW, PLANNED);
  setPlan(user, UNFOLLOW, PLANNED);
  expect(planOf(user, UNFOLLOW)).toBe(PLANNED);
  expect(() => {
    setPlan(user, REMOVE_FOLLOWER, PLANNED);
  }).toThrow('setPlan: no follow');
});

test('multiple follower export chunks can be parsed and deduplicated case-insensitively', () => {
  const file1 = [
    { string_list_data: [{ value: 'Alice', timestamp: 10 }] },
    { string_list_data: [{ value: 'Bob', timestamp: 20 }] },
  ];
  const file2 = [
    { string_list_data: [{ value: 'alice', timestamp: 30 }] },
    { string_list_data: [{ value: 'Carol', timestamp: 40 }] },
  ];

  const merged = dedupeAccounts([...parseFollowersJson(file1), ...parseFollowersJson(file2)]);
  expect(merged).toHaveLength(3);
  expect(merged.find(entry => entry.username.toLowerCase() === 'alice')?.since).toBe(30);
});

test('session diff reports only net decision, tag and metadata changes', () => {
  const alice = follows(account('alice'), { following: true, followedBy: true });
  alice.review.tags = ['artist'];
  alice.review.notes = 'before';
  const baseline = accountsOf(alice);

  const current = structuredClone(baseline);
  const currentAlice = must(current.alice);
  currentAlice.review.tags = ['artist', 'photography'];
  currentAlice.review.notes = 'after';
  setPlan(currentAlice, UNFOLLOW, PLANNED);

  const diff = buildSessionDiff(baseline, current);
  expect(diff).toEqual([
    {
      username: 'alice',
      changes: [
        {
          type: SESSION_CHANGES.DECISION_CHANGED,
          from: null,
          to: { kind: DecisionKind.QUEUED, plans: { unfollow: PLANNED } },
        },
        { type: SESSION_CHANGES.TAG_ADDED, tag: 'photography' },
        { type: SESSION_CHANGES.NOTE_EDITED },
      ],
    },
  ]);
});

test('session diff ignores edits that end back at baseline', () => {
  const alice = follows(account('alice'), { following: true });
  alice.review.tags = ['artist'];
  const baseline = accountsOf(alice);
  const current = structuredClone(baseline);
  const currentAlice = must(current.alice);

  currentAlice.review.tags.push('fashion');
  currentAlice.review.tags = ['artist'];
  keep(currentAlice);
  undecide(currentAlice);

  expect(buildSessionDiff(baseline, current)).toEqual([]);
});

test('session diff reports a plan cancelled, done or undone as one decision change', () => {
  const alice = follows(account('alice'), { following: true, followedBy: true });
  setPlan(alice, REMOVE_FOLLOWER, PLANNED);
  setPlan(alice, UNFOLLOW, DONE);
  const baseline = accountsOf(alice);
  const current = structuredClone(baseline);
  setPlan(must(current.alice), REMOVE_FOLLOWER, undefined);
  setPlan(must(current.alice), UNFOLLOW, PLANNED);
  expect(buildSessionDiff(baseline, current)[0]?.changes).toEqual([
    {
      type: SESSION_CHANGES.DECISION_CHANGED,
      from: { kind: DecisionKind.QUEUED, plans: { unfollow: DONE, removeFollower: PLANNED } },
      to: { kind: DecisionKind.QUEUED, plans: { unfollow: PLANNED } },
    },
  ]);

  const later = structuredClone(current);
  setPlan(must(later.alice), UNFOLLOW, DONE);
  expect(buildSessionDiff(current, later)[0]?.changes).toEqual([
    {
      type: SESSION_CHANGES.DECISION_CHANGED,
      from: { kind: DecisionKind.QUEUED, plans: { unfollow: PLANNED } },
      to: { kind: DecisionKind.QUEUED, plans: { unfollow: DONE } },
    },
  ]);
});

test('unsaved tag changes are grouped across accounts', () => {
  const alice = follows(account('alice'), { following: true });
  const bob = follows(account('bob'), { following: true });
  const baseline = accountsOf(alice, bob);
  const current = structuredClone(baseline);
  must(current.alice).review.tags = ['artist'];
  must(current.bob).review.tags = ['artist', 'photography'];

  const grouped = groupSessionChanges(buildSessionDiff(baseline, current));
  expect(grouped.tagRows).toEqual([
    { kind: TagChangeKind.ADDED, tag: 'artist', usernames: ['alice', 'bob'] },
    { kind: TagChangeKind.ADDED, tag: 'photography', usernames: ['bob'] },
  ]);
  expect(grouped.accounts).toEqual([]); // only tags changed
});

test('plan stats count planned and done actions per type', () => {
  const first = follows(account('a'), { following: true, followedBy: true });
  setPlan(first, UNFOLLOW, PLANNED);
  setPlan(first, REMOVE_FOLLOWER, DONE);
  const second = follows(account('b'), { following: true });
  setPlan(second, UNFOLLOW, DONE);
  expect(planStats(stateWith(first, second))).toEqual({
    [PLANNED]: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 },
    [DONE]: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 1 },
  });
});
