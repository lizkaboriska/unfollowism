// Review rules: scopes, decisions, plans and session changes.
import {
  ACTION_TYPES,
  DecisionFilter,
  DecisionKind,
  PLAN_STATES,
  REVIEW_SCOPES,
  SESSION_CATEGORIES,
  SESSION_CHANGES,
  TAG_FILTER_KINDS,
  buildSessionDiff,
  dedupeAccounts,
  keep,
  undecide,
  planOf,
  planStats,
  parseFollowersJson,
  relationshipStats,
  reviewScopeAccounts,
  scopeMatches,
  setPlan,
  settlePlans,
  summarizeSession,
  type Account,
} from '../index.ts';

import { account, follows, must, stateWith } from './helpers.ts';

const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;
const { PLANNED, DONE } = PLAN_STATES;
const none = { [UNFOLLOW]: 0, [REMOVE_FOLLOWER]: 0 };
const tag = (name: string) => ({ kind: TAG_FILTER_KINDS.TAG, tag: name });
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

test('scope stats describe whichever audit queue is selected', () => {
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
  const a = follows(account(), { following: true });
  const state = stateWith(a);

  setPlan(a, UNFOLLOW, PLANNED);
  expect(planOf(a, UNFOLLOW)).toBe(PLANNED);
  expect(a.decision).toEqual({ kind: DecisionKind.QUEUED, plans: { unfollow: PLANNED } });

  expect(settlePlans(state)).toEqual({ completed: none, reopened: none }); // still followed
  expect(planOf(a, UNFOLLOW)).toBe(PLANNED);

  follows(a, {});
  expect(settlePlans(state)).toEqual({ completed: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 }, reopened: none });
  expect(planOf(a, UNFOLLOW)).toBeUndefined();
  expect(a.decision, 'its only plan happened, so it counts as Kept').toEqual({ kind: DecisionKind.KEPT });
});

test('remove follower is symmetric to unfollow', () => {
  const a = follows(account(), { followedBy: true });
  setPlan(a, REMOVE_FOLLOWER, PLANNED);
  follows(a, {});
  expect(settlePlans(stateWith(a)).completed).toEqual({ [UNFOLLOW]: 0, [REMOVE_FOLLOWER]: 1 });
  expect(planOf(a, REMOVE_FOLLOWER)).toBeUndefined();
});

test('a plan marked done that the export contradicts goes back to planned', () => {
  const a = follows(account(), { following: true });
  setPlan(a, UNFOLLOW, DONE);
  expect(settlePlans(stateWith(a))).toEqual({ completed: none, reopened: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 } });
  expect(planOf(a, UNFOLLOW)).toBe(PLANNED);
});

test('a plan can be cancelled without affecting account review data', () => {
  const a = follows(account(), { following: true, followedBy: true });
  a.review.tags = ['artist'];
  setPlan(a, UNFOLLOW, PLANNED);
  setPlan(a, UNFOLLOW, undefined);
  expect(planOf(a, UNFOLLOW)).toBeUndefined();
  expect(a.decision, 'undoing the last plan: needs a decision again').toBeUndefined();
  expect(a.review.tags).toEqual(['artist']);
});

test("marking is idempotent and refuses actions the relationship doesn't allow", () => {
  const a = follows(account(), { following: true });
  setPlan(a, UNFOLLOW, PLANNED);
  setPlan(a, UNFOLLOW, PLANNED);
  expect(planOf(a, UNFOLLOW)).toBe(PLANNED);
  expect(() => {
    setPlan(a, REMOVE_FOLLOWER, PLANNED);
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
  expect(merged.find(x => x.username.toLowerCase() === 'alice')?.since).toBe(30);
});

test('review query can combine scope, tag and decision', () => {
  const a = follows(account('artist_kept'), { following: true, followedBy: true });
  a.review.tags = ['artist'];
  keep(a);
  const b = follows(account('artist_pending'), { following: true });
  b.review.tags = ['artist'];
  const c = follows(account('friend_pending'), { following: true });
  c.review.tags = ['friend'];

  const result = reviewScopeAccounts(stateWith(a, b, c), {
    scope: REVIEW_SCOPES.FOLLOWING,
    tag: tag('artist'),
    decision: DecisionFilter.NEEDS_DECISION,
  });
  expect(result.map(x => x.username)).toEqual(['artist_pending']);
});

test('session diff reports only net decision, tag and metadata changes', () => {
  const a = follows(account('alice'), { following: true, followedBy: true });
  a.review.tags = ['artist'];
  a.review.notes = 'before';
  const baseline = accountsOf(a);

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
  const summary = summarizeSession(diff);
  expect(summary.changedAccounts).toBe(1);
  expect(summary.changeCount).toBe(3);
  expect(summary.byCategory).toEqual({
    [SESSION_CATEGORIES.DECISIONS]: 1,
    [SESSION_CATEGORIES.TAGS]: 1,
    [SESSION_CATEGORIES.OTHER]: 1,
  });
  expect(summary.tagsAdded).toEqual([{ tag: 'photography', count: 1 }]);
});

test('session diff ignores edits that end back at baseline', () => {
  const a = follows(account('alice'), { following: true });
  a.review.tags = ['artist'];
  const baseline = accountsOf(a);
  const current = structuredClone(baseline);
  const currentAlice = must(current.alice);

  currentAlice.review.tags.push('fashion');
  currentAlice.review.tags = ['artist'];
  keep(currentAlice);
  undecide(currentAlice);

  expect(buildSessionDiff(baseline, current)).toEqual([]);
});

test('session diff reports a plan cancelled, done or undone as one decision change', () => {
  const a = follows(account('alice'), { following: true, followedBy: true });
  setPlan(a, REMOVE_FOLLOWER, PLANNED);
  setPlan(a, UNFOLLOW, DONE);
  const baseline = accountsOf(a);
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

test('session summary groups tag additions across accounts', () => {
  const a = follows(account('alice'), { following: true });
  const b = follows(account('bob'), { following: true });
  const baseline = accountsOf(a, b);
  const current = structuredClone(baseline);
  must(current.alice).review.tags = ['artist'];
  must(current.bob).review.tags = ['artist', 'photography'];

  const summary = summarizeSession(buildSessionDiff(baseline, current));
  expect(summary.tagsAdded).toEqual([
    { tag: 'artist', count: 2 },
    { tag: 'photography', count: 1 },
  ]);
  expect(summary.byCategory[SESSION_CATEGORIES.TAGS]).toBe(3);
  expect(summary.changedAccounts).toBe(2);
});

test('plan stats count planned and done actions per type', () => {
  const a = follows(account('a'), { following: true, followedBy: true });
  setPlan(a, UNFOLLOW, PLANNED);
  setPlan(a, REMOVE_FOLLOWER, DONE);
  const b = follows(account('b'), { following: true });
  setPlan(b, UNFOLLOW, DONE);
  expect(planStats(stateWith(a, b))).toEqual({
    [PLANNED]: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 },
    [DONE]: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 1 },
  });
});
