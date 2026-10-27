// Port of legacy/tests/tracker-core.test.js, kept to the original intent of each test.
// The old v3/v5 migration tests were dropped together with the migration code.
import {
  ACTION_TYPES,
  REVIEW_SCOPES,
  REVIEW_STATUSES,
  SESSION_CATEGORIES,
  SESSION_CHANGES,
  TAG_FILTER_KINDS,
  actionStats,
  buildSessionDiff,
  cancelPending,
  confirmPendingActions,
  dedupeAccounts,
  isPending,
  markPending,
  markReviewed,
  parseFollowersJson,
  relationshipStats,
  resetReviewedForScope,
  reviewScopeAccounts,
  reviewScopeStats,
  scopeMatches,
  summarizeSession,
  type Account,
} from "../index.ts";
import { account, follows, lossesWith, must, stateWith } from "./helpers.ts";

const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;
const tag = (name: string) => ({ kind: TAG_FILTER_KINDS.TAG, tag: name });
const accountsOf = (...items: Account[]) => stateWith(...items).accounts;

test("review state is reusable and keeps the last reviewed timestamp when reset", () => {
  const a = account();
  a.review.tags = ["artist"];
  a.review.notes = "great illustrator";

  markReviewed(a, true, "2026-09-05T10:00:00Z");
  expect(a.review.reviewed).toBe(true);
  expect(a.review.lastReviewedAt).toBe("2026-09-05T10:00:00Z");

  markReviewed(a, false, "2026-10-01T10:00:00Z");
  expect(a.review.reviewed).toBe(false);
  expect(a.review.lastReviewedAt).toBe("2026-09-05T10:00:00Z");
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
  markReviewed(artistMutual, true, "2026-08-01T10:00:00Z");

  const artistNotBack = follows(account("artist_notback"), { following: true });
  artistNotBack.review.tags = ["artist"];
  markReviewed(artistNotBack, true, "2026-08-02T10:00:00Z");

  const friendMutual = follows(account("friend_mutual"), { following: true, followedBy: true });
  friendMutual.review.tags = ["friend"];
  markReviewed(friendMutual, true, "2026-08-03T10:00:00Z");

  const state = stateWith(artistMutual, artistNotBack, friendMutual);
  expect(resetReviewedForScope(state, { scope: REVIEW_SCOPES.MUTUAL, tag: tag("artist") })).toBe(1);
  expect(artistMutual.review).toMatchObject({ reviewed: false, lastReviewedAt: "2026-08-01T10:00:00Z", tags: ["artist", "friend"], notes: "keep this" });
  expect(artistNotBack.review.reviewed).toBe(true);
  expect(friendMutual.review.reviewed).toBe(true);
});

test("scope stats describe whichever audit queue is selected", () => {
  const mutual = follows(account("mutual"), { following: true, followedBy: true });
  markReviewed(mutual, true, "2026-09-01T00:00:00Z");
  const notBack = follows(account("notback"), { following: true });
  const followerOnly = follows(account("follower"), { followedBy: true });

  const state = stateWith(mutual, notBack, followerOnly);
  expect(relationshipStats(state)).toEqual({ following: 2, followers: 2, mutual: 1, notFollowingBack: 1, followsYouOnly: 1, currentAccounts: 3 });
  expect(reviewScopeStats(state, { scope: REVIEW_SCOPES.FOLLOWING })).toEqual({ total: 2, reviewed: 1, needsReview: 1, unavailable: 0 });
  expect(reviewScopeStats(state, { scope: REVIEW_SCOPES.FOLLOWERS })).toEqual({ total: 2, reviewed: 1, needsReview: 1, unavailable: 0 });
});

test("pending unfollow is separate from review state and confirms only from stopped-following", () => {
  const a = follows(account(), { following: true });
  const state = stateWith(a);

  markPending(a, UNFOLLOW);
  expect(isPending(a, UNFOLLOW)).toBe(true);
  expect(a.review.reviewed, "core action creation does not implicitly rewrite review state").toBe(false);

  // Still followed: cannot be confirmed even if a malformed loss list mentions the name.
  const losses = lossesWith({ stopped: ["alice"] });
  expect(confirmPendingActions(state, losses)).toEqual({ [UNFOLLOW]: 0, [REMOVE_FOLLOWER]: 0 });

  follows(a, {});
  expect(confirmPendingActions(state, losses)).toEqual({ [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 });
  expect(a.actions).toEqual({ pending: [], confirmed: [UNFOLLOW] });
});

test("remove follower is symmetric to unfollow and confirms from lost followers", () => {
  const a = follows(account(), { followedBy: true });
  const state = stateWith(a);

  markPending(a, REMOVE_FOLLOWER);
  follows(a, {});
  expect(confirmPendingActions(state, lossesWith({ lost: ["Alice"] }))).toEqual({ [UNFOLLOW]: 0, [REMOVE_FOLLOWER]: 1 });
  expect(a.actions).toEqual({ pending: [], confirmed: [REMOVE_FOLLOWER] });
});

test("pending action can be cancelled without affecting account review data", () => {
  const a = follows(account(), { following: true, followedBy: true });
  a.review.tags = ["artist"];
  markPending(a, UNFOLLOW);

  expect(cancelPending(a, UNFOLLOW)).toBe(true);
  expect(cancelPending(a, UNFOLLOW)).toBe(false);
  expect(a.actions).toEqual({ pending: [], confirmed: [] });
  expect(a.review.tags).toEqual(["artist"]);
});

test("marking is idempotent and refuses actions the relationship doesn't allow", () => {
  const a = follows(account(), { following: true });
  markPending(a, UNFOLLOW);
  markPending(a, UNFOLLOW);
  expect(a.actions.pending).toEqual([UNFOLLOW]);
  expect(() => { markPending(a, REMOVE_FOLLOWER); }).toThrow("does not follow you");
});

test("re-unfollowing after a refollow keeps one confirmed entry", () => {
  const a = follows(account(), { following: true }); // followed again
  a.actions.confirmed = [UNFOLLOW];
  markPending(a, UNFOLLOW);
  follows(a, {});
  confirmPendingActions(stateWith(a), lossesWith({ stopped: ["alice"] }));
  expect(a.actions).toEqual({ pending: [], confirmed: [UNFOLLOW] });
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
  markReviewed(a, true, "2026-09-01T00:00:00Z");
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
  markReviewed(currentAlice, true, "2026-09-05T18:00:00Z");
  currentAlice.review.tags = ["artist", "photography"];
  currentAlice.review.notes = "after";
  markPending(currentAlice, UNFOLLOW);

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

test("session diff ignores tag edits that end back at baseline but keeps persistent last-reviewed changes", () => {
  const a = follows(account("alice"), { following: true });
  a.review.tags = ["artist"];
  const baseline = accountsOf(a);
  const current = structuredClone(baseline);
  const currentAlice = must(current.alice);

  currentAlice.review.tags.push("fashion");
  currentAlice.review.tags = ["artist"];
  markReviewed(currentAlice, true, "2026-09-05T18:00:00Z");
  markReviewed(currentAlice, false, "2026-09-05T18:01:00Z");

  expect(buildSessionDiff(baseline, current)).toEqual([{ username: "alice", changes: [{ type: SESSION_CHANGES.LAST_REVIEWED_UPDATED }] }]);
});

test("session diff reports a cancelled action", () => {
  const a = follows(account("alice"), { followedBy: true });
  markPending(a, REMOVE_FOLLOWER);
  const baseline = accountsOf(a);
  const current = structuredClone(baseline);
  cancelPending(must(current.alice), REMOVE_FOLLOWER);
  expect(buildSessionDiff(baseline, current)[0]?.changes).toEqual([{ type: SESSION_CHANGES.ACTION_CANCELLED, action: REMOVE_FOLLOWER }]);
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

test("action stats count pending and confirmed actions per type", () => {
  const a = follows(account(), { following: true, followedBy: true });
  markPending(a, UNFOLLOW);
  markPending(a, REMOVE_FOLLOWER);
  a.actions.confirmed = [UNFOLLOW];
  expect(actionStats(stateWith(a))).toEqual({
    pending: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 1 },
    confirmed: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 },
  });
});
