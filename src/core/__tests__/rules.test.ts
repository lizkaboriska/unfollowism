// Review rules: scopes, Reset scope, plans and session changes.
import {
  ACTION_TYPES,
  PLAN_STATES,
  REVIEW_SCOPES,
  REVIEW_STATUSES,
  SESSION_CATEGORIES,
  SESSION_CHANGES,
  TAG_FILTER_KINDS,
  buildSessionDiff,
  dedupeAccounts,
  planOf,
  planStats,
  parseFollowersJson,
  relationshipStats,
  resetReviewedForScope,
  reviewScopeAccounts,
  reviewScopeStats,
  scopeMatches,
  setPlan,
  settlePlans,
  summarizeSession,
  type Account,
} from "../index.ts";
import { account, follows, must, stateWith } from "./helpers.ts";

const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;
const { PLANNED, DONE } = PLAN_STATES;
const none = { [UNFOLLOW]: 0, [REMOVE_FOLLOWER]: 0 };
const tag = (name: string) => ({ kind: TAG_FILTER_KINDS.TAG, tag: name });
const accountsOf = (...items: Account[]) => stateWith(...items).accounts;

test("review state is reusable: resetting reviewed keeps tags and notes", () => {
  const a = account();
  a.review.tags = ["artist"];
  a.review.notes = "great illustrator";
  a.review.reviewed = true;

  expect(resetReviewedForScope(stateWith(follows(a, { following: true })), { scope: REVIEW_SCOPES.FOLLOWING })).toBe(1);
  expect(a.review.reviewed).toBe(false);
  expect(a.review.tags).toEqual(["artist"]);
  expect(a.review.notes).toBe("great illustrator");
});

test("review scopes support overlapping following/follower views", () => {
  const mutual = follows(account("mutual"), { following: true, followedBy: true });
  const notBack = follows(account("notback"), { following: true });
  const followerOnly = follows(account("follower"), { followedBy: true });

  expect(scopeMatches(mutual, REVIEW_SCOPES.FOLLOWING)).toBe(true);
  expect(scopeMatches(mutual, REVIEW_SCOPES.FOLLOWERS)).toBe(true);
  expect(scopeMatches(mutual, REVIEW_SCOPES.MUTUAL)).toBe(true);
  expect(scopeMatches(notBack, REVIEW_SCOPES.FOLLOWING)).toBe(true);
  expect(scopeMatches(notBack, REVIEW_SCOPES.FOLLOWERS)).toBe(false);
  expect(scopeMatches(followerOnly, REVIEW_SCOPES.FOLLOWERS)).toBe(true);
  expect(scopeMatches(followerOnly, REVIEW_SCOPES.FOLLOWING)).toBe(false);
});

test("reset applies only to the requested scope and tag and preserves metadata", () => {
  const artistMutual = follows(account("artist_mutual"), { following: true, followedBy: true });
  artistMutual.review.tags = ["artist", "friend"];
  artistMutual.review.notes = "keep this";
  artistMutual.review.reviewed = true;

  const artistNotBack = follows(account("artist_notback"), { following: true });
  artistNotBack.review.tags = ["artist"];
  artistNotBack.review.reviewed = true;

  const friendMutual = follows(account("friend_mutual"), { following: true, followedBy: true });
  friendMutual.review.tags = ["friend"];
  friendMutual.review.reviewed = true;

  const state = stateWith(artistMutual, artistNotBack, friendMutual);
  expect(resetReviewedForScope(state, { scope: REVIEW_SCOPES.MUTUAL, tag: tag("artist") })).toBe(1);
  expect(artistMutual.review).toMatchObject({ reviewed: false, tags: ["artist", "friend"], notes: "keep this" });
  expect(artistNotBack.review.reviewed).toBe(true);
  expect(friendMutual.review.reviewed).toBe(true);
});

test("scope stats describe whichever audit queue is selected", () => {
  const mutual = follows(account("mutual"), { following: true, followedBy: true });
  mutual.review.reviewed = true;
  const notBack = follows(account("notback"), { following: true });
  const followerOnly = follows(account("follower"), { followedBy: true });

  const state = stateWith(mutual, notBack, followerOnly);
  expect(relationshipStats(state)).toEqual({ following: 2, followers: 2, mutual: 1, notFollowingBack: 1, followsYouOnly: 1, currentAccounts: 3 });
  expect(reviewScopeStats(state, { scope: REVIEW_SCOPES.FOLLOWING })).toEqual({ total: 2, reviewed: 1, needsReview: 1, unavailable: 0 });
  expect(reviewScopeStats(state, { scope: REVIEW_SCOPES.FOLLOWERS })).toEqual({ total: 2, reviewed: 1, needsReview: 1, unavailable: 0 });
});

// A plan is cleared once the export no longer has the follow; a plan marked done that the
// export contradicts goes back to planned.
test("a planned unfollow is separate from review state and is completed only once the follow is gone", () => {
  const a = follows(account(), { following: true });
  const state = stateWith(a);

  setPlan(a, UNFOLLOW, PLANNED);
  expect(planOf(a, UNFOLLOW)).toBe(PLANNED);
  expect(a.review.reviewed, "core plan creation does not implicitly rewrite review state").toBe(false);

  expect(settlePlans(state)).toEqual({ completed: none, reopened: none }); // still followed
  expect(planOf(a, UNFOLLOW)).toBe(PLANNED);

  follows(a, {});
  expect(settlePlans(state)).toEqual({ completed: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 }, reopened: none });
  expect(a.toUnfollow).toBeUndefined();
});

test("remove follower is symmetric to unfollow", () => {
  const a = follows(account(), { followedBy: true });
  setPlan(a, REMOVE_FOLLOWER, PLANNED);
  follows(a, {});
  expect(settlePlans(stateWith(a)).completed).toEqual({ [UNFOLLOW]: 0, [REMOVE_FOLLOWER]: 1 });
  expect(a.toRemove).toBeUndefined();
});

test("a plan marked done that the export contradicts goes back to planned", () => {
  const a = follows(account(), { following: true });
  setPlan(a, UNFOLLOW, DONE);
  expect(settlePlans(stateWith(a))).toEqual({ completed: none, reopened: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 } });
  expect(a.toUnfollow).toBe(PLANNED);
});

test("a plan can be cancelled without affecting account review data", () => {
  const a = follows(account(), { following: true, followedBy: true });
  a.review.tags = ["artist"];
  setPlan(a, UNFOLLOW, PLANNED);
  setPlan(a, UNFOLLOW, undefined);
  expect(planOf(a, UNFOLLOW)).toBeUndefined();
  expect(a.review.tags).toEqual(["artist"]);
});

test("marking is idempotent and refuses actions the relationship doesn't allow", () => {
  const a = follows(account(), { following: true });
  setPlan(a, UNFOLLOW, PLANNED);
  setPlan(a, UNFOLLOW, PLANNED);
  expect(a.toUnfollow).toBe(PLANNED);
  expect(() => { setPlan(a, REMOVE_FOLLOWER, PLANNED); }).toThrow("setPlan: no follow");
});

test("multiple follower export chunks can be parsed and deduplicated case-insensitively", () => {
  const file1 = [
    { string_list_data: [{ value: "Alice", timestamp: 10 }] },
    { string_list_data: [{ value: "Bob", timestamp: 20 }] },
  ];
  const file2 = [
    { string_list_data: [{ value: "alice", timestamp: 30 }] },
    { string_list_data: [{ value: "Carol", timestamp: 40 }] },
  ];

  const merged = dedupeAccounts([...parseFollowersJson(file1), ...parseFollowersJson(file2)]);
  expect(merged).toHaveLength(3);
  expect(merged.find(x => x.username.toLowerCase() === "alice")?.since).toBe(30);
});

test("review query can combine scope, tag and status", () => {
  const a = follows(account("artist_reviewed"), { following: true, followedBy: true });
  a.review.tags = ["artist"];
  a.review.reviewed = true;
  const b = follows(account("artist_pending"), { following: true });
  b.review.tags = ["artist"];
  const c = follows(account("friend_pending"), { following: true });
  c.review.tags = ["friend"];

  const result = reviewScopeAccounts(stateWith(a, b, c), { scope: REVIEW_SCOPES.FOLLOWING, tag: tag("artist"), reviewStatus: REVIEW_STATUSES.NEEDS_REVIEW });
  expect(result.map(x => x.username)).toEqual(["artist_pending"]);
});

test("session diff reports only net review, tag, action and metadata changes", () => {
  const a = follows(account("alice"), { following: true, followedBy: true });
  a.review.tags = ["artist"];
  a.review.notes = "before";
  const baseline = accountsOf(a);

  const current = structuredClone(baseline);
  const currentAlice = must(current.alice);
  currentAlice.review.reviewed = true;
  currentAlice.review.tags = ["artist", "photography"];
  currentAlice.review.notes = "after";
  setPlan(currentAlice, UNFOLLOW, PLANNED);

  const diff = buildSessionDiff(baseline, current);
  expect(diff).toEqual([{
    username: "alice",
    changes: [
      { type: SESSION_CHANGES.REVIEWED },
      { type: SESSION_CHANGES.TAG_ADDED, tag: "photography" },
      { type: SESSION_CHANGES.NOTE_EDITED },
      { type: SESSION_CHANGES.ACTION_MARKED, action: UNFOLLOW },
    ],
  }]);
  const summary = summarizeSession(diff);
  expect(summary.changedAccounts).toBe(1);
  expect(summary.changeCount).toBe(4);
  expect(summary.byCategory).toEqual({ [SESSION_CATEGORIES.REVIEWS]: 1, [SESSION_CATEGORIES.TAGS]: 1, [SESSION_CATEGORIES.ACTIONS]: 1, [SESSION_CATEGORIES.OTHER]: 1 });
  expect(summary.tagsAdded).toEqual([{ tag: "photography", count: 1 }]);
});

test("session diff ignores edits that end back at baseline", () => {
  const a = follows(account("alice"), { following: true });
  a.review.tags = ["artist"];
  const baseline = accountsOf(a);
  const current = structuredClone(baseline);
  const currentAlice = must(current.alice);

  currentAlice.review.tags.push("fashion");
  currentAlice.review.tags = ["artist"];
  currentAlice.review.reviewed = true;
  currentAlice.review.reviewed = false;

  expect(buildSessionDiff(baseline, current)).toEqual([]);
});

test("session diff reports a cancelled, a done and an undone plan", () => {
  const a = follows(account("alice"), { following: true, followedBy: true });
  setPlan(a, REMOVE_FOLLOWER, PLANNED);
  setPlan(a, UNFOLLOW, DONE);
  const baseline = accountsOf(a);
  const current = structuredClone(baseline);
  setPlan(must(current.alice), REMOVE_FOLLOWER, undefined);
  setPlan(must(current.alice), UNFOLLOW, PLANNED);
  expect(buildSessionDiff(baseline, current)[0]?.changes).toEqual([
    { type: SESSION_CHANGES.ACTION_UNDONE, action: UNFOLLOW },
    { type: SESSION_CHANGES.ACTION_CANCELLED, action: REMOVE_FOLLOWER },
  ]);

  const later = structuredClone(current);
  setPlan(must(later.alice), UNFOLLOW, DONE);
  expect(buildSessionDiff(current, later)[0]?.changes).toEqual([{ type: SESSION_CHANGES.ACTION_DONE, action: UNFOLLOW }]);
});

test("session summary groups tag additions across accounts", () => {
  const a = follows(account("alice"), { following: true });
  const b = follows(account("bob"), { following: true });
  const baseline = accountsOf(a, b);
  const current = structuredClone(baseline);
  must(current.alice).review.tags = ["artist"];
  must(current.bob).review.tags = ["artist", "photography"];

  const summary = summarizeSession(buildSessionDiff(baseline, current));
  expect(summary.tagsAdded).toEqual([
    { tag: "artist", count: 2 },
    { tag: "photography", count: 1 },
  ]);
  expect(summary.byCategory[SESSION_CATEGORIES.TAGS]).toBe(3);
  expect(summary.changedAccounts).toBe(2);
});

test("plan stats count planned and done actions per type", () => {
  const a = follows(account("a"), { following: true, followedBy: true });
  setPlan(a, UNFOLLOW, PLANNED);
  setPlan(a, REMOVE_FOLLOWER, DONE);
  const b = follows(account("b"), { following: true });
  setPlan(b, UNFOLLOW, DONE);
  expect(planStats(stateWith(a, b))).toEqual({
    [PLANNED]: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 },
    [DONE]: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 1 },
  });
});
