// 1:1 port of legacy/tests/tracker-core.test.js. Only call shapes changed:
// tag filters are structured ({ kind: "tag", tag }) and ensureReview became normalizeReview.
import {
  SCHEMA_VERSION,
  STATUS_SEMANTICS,
  actionStats,
  addPendingAction,
  buildSessionDiff,
  cancelPendingAction,
  confirmPendingActions,
  dedupeAccounts,
  markReviewed,
  normalizeMaster,
  normalizeReview,
  parseFollowersJson,
  pendingAction,
  relationshipStats,
  resetReviewedForScope,
  reviewScopeAccounts,
  reviewScopeStats,
  scopeMatches,
  syncCurrentRelationship,
  type Master,
  type Snapshot,
} from "../index.ts";
import { account, stateWith } from "./helpers.ts";

const tag = (name: string) => ({ kind: "tag", tag: name }) as const;

test("review state is reusable and keeps the last reviewed timestamp when reset", () => {
  const a = account();
  a.review.tags = ["artist"];
  a.review.notes = "great illustrator";

  markReviewed(a, true, "2026-09-05T10:00:00Z");
  expect(a.review.reviewed).toBe(true);
  expect(a.review.last_reviewed_at).toBe("2026-09-05T10:00:00Z");

  markReviewed(a, false, "2026-10-01T10:00:00Z");
  expect(a.review.reviewed).toBe(false);
  expect(a.review.last_reviewed_at).toBe("2026-09-05T10:00:00Z");
  expect(a.review.tags).toEqual(["artist"]);
  expect(a.review.notes).toBe("great illustrator");
});

test("review scopes support overlapping following/follower views", () => {
  const mutual = account("mutual");
  syncCurrentRelationship(mutual, { username: "mutual" }, { username: "mutual" });
  const notBack = account("notback");
  syncCurrentRelationship(notBack, { username: "notback" }, null);
  const followerOnly = account("follower");
  syncCurrentRelationship(followerOnly, null, { username: "follower" });

  expect(scopeMatches(mutual, "following")).toBe(true);
  expect(scopeMatches(mutual, "followers")).toBe(true);
  expect(scopeMatches(mutual, "mutual")).toBe(true);
  expect(scopeMatches(notBack, "following")).toBe(true);
  expect(scopeMatches(notBack, "followers")).toBe(false);
  expect(scopeMatches(followerOnly, "followers")).toBe(true);
  expect(scopeMatches(followerOnly, "following")).toBe(false);
});

test("reset applies only to the requested scope and tag and preserves metadata", () => {
  const artistMutual = account("artist_mutual");
  artistMutual.review.tags = ["artist", "friend"];
  artistMutual.review.notes = "keep this";
  markReviewed(artistMutual, true, "2026-08-01T10:00:00Z");
  syncCurrentRelationship(artistMutual, { username: artistMutual.username }, { username: artistMutual.username });

  const artistNotBack = account("artist_notback");
  artistNotBack.review.tags = ["artist"];
  markReviewed(artistNotBack, true, "2026-08-02T10:00:00Z");
  syncCurrentRelationship(artistNotBack, { username: artistNotBack.username }, null);

  const friendMutual = account("friend_mutual");
  friendMutual.review.tags = ["friend"];
  markReviewed(friendMutual, true, "2026-08-03T10:00:00Z");
  syncCurrentRelationship(friendMutual, { username: friendMutual.username }, { username: friendMutual.username });

  const state = stateWith(artistMutual, artistNotBack, friendMutual);
  const reset = resetReviewedForScope(state, { scope: "mutual", tag: tag("artist") });

  expect(reset).toBe(1);
  expect(artistMutual.review.reviewed).toBe(false);
  expect(artistMutual.review.last_reviewed_at).toBe("2026-08-01T10:00:00Z");
  expect(artistMutual.review.tags).toEqual(["artist", "friend"]);
  expect(artistMutual.review.notes).toBe("keep this");
  expect(artistNotBack.review.reviewed).toBe(true);
  expect(friendMutual.review.reviewed).toBe(true);
});

test("scope stats describe whichever audit queue is selected", () => {
  const mutual = account("mutual");
  markReviewed(mutual, true, "2026-09-01T00:00:00Z");
  syncCurrentRelationship(mutual, { username: "mutual" }, { username: "mutual" });

  const notBack = account("notback");
  syncCurrentRelationship(notBack, { username: "notback" }, null);

  const followerOnly = account("follower");
  syncCurrentRelationship(followerOnly, null, { username: "follower" });

  const state = stateWith(mutual, notBack, followerOnly);
  expect(relationshipStats(state)).toEqual({
    following: 2,
    followers: 2,
    mutual: 1,
    notFollowingBack: 1,
    followsYouOnly: 1,
    currentAccounts: 3,
  });
  expect(reviewScopeStats(state, { scope: "following" })).toEqual({ total: 2, reviewed: 1, needsReview: 1, unavailable: 0 });
  expect(reviewScopeStats(state, { scope: "followers" })).toEqual({ total: 2, reviewed: 1, needsReview: 1, unavailable: 0 });
});

test("pending unfollow is a separate action and confirms only from stopped_following", () => {
  const a = account();
  syncCurrentRelationship(a, { username: "alice" }, null);
  const state = stateWith(a);

  addPendingAction(state, a, "unfollow", "2026-09-01T10:00:00Z");
  expect(pendingAction(state, "alice", "unfollow")).toBeTruthy();
  expect(a.review.reviewed, "core action creation does not implicitly rewrite review state").toBe(false);

  // Still followed: cannot be confirmed even if a malformed snapshot mentions the name.
  const snapshot = {
    snapshot_id: "snapshot_1",
    snapshot_date: "2026-09-02",
    captured_at: "2026-09-02T10:00:00Z",
    source_files: [],
    following: {},
    followers: {},
    changes_from_previous_snapshot: { stopped_following: ["alice"], lost_followers: [] },
  } satisfies Snapshot;
  expect(confirmPendingActions(state, snapshot, "2099-01-01T00:00:00Z").total).toBe(0);

  syncCurrentRelationship(a, null, null);
  const confirmed = confirmPendingActions(state, snapshot, "2099-01-01T00:00:00Z");
  expect(confirmed).toEqual({ unfollow: 1, remove_follower: 0, total: 1 });
  expect(state.actions[0]?.status).toBe("confirmed");
  expect(state.actions[0]?.confirmation_snapshot_id).toBe("snapshot_1");
});

test("remove follower is symmetric to unfollow and confirms from lost_followers", () => {
  const a = account();
  syncCurrentRelationship(a, null, { username: "alice" });
  const state = stateWith(a);

  addPendingAction(state, a, "remove_follower", "2026-09-01T10:00:00Z");
  syncCurrentRelationship(a, null, null);
  const snapshot = {
    snapshot_id: "snapshot_2",
    snapshot_date: "2026-09-03",
    captured_at: "2026-09-03T10:00:00Z",
    source_files: [],
    following: {},
    followers: {},
    changes_from_previous_snapshot: { stopped_following: [], lost_followers: ["Alice"] },
  } satisfies Snapshot;

  const confirmed = confirmPendingActions(state, snapshot, "2099-01-01T00:00:00Z");
  expect(confirmed).toEqual({ unfollow: 0, remove_follower: 1, total: 1 });
  expect(state.actions[0]?.type).toBe("remove_follower");
  expect(state.actions[0]?.status).toBe("confirmed");
});

test("pending action can be cancelled without affecting account review data", () => {
  const a = account();
  a.review.tags = ["artist"];
  syncCurrentRelationship(a, { username: "alice" }, { username: "alice" });
  const state = stateWith(a);
  addPendingAction(state, a, "unfollow", "2026-09-01T10:00:00Z");

  expect(cancelPendingAction(state, "alice", "unfollow", "2026-09-01T11:00:00Z")).toBe(true);
  expect(pendingAction(state, "alice", "unfollow")).toBeNull();
  expect(state.actions[0]?.status).toBe("cancelled");
  expect(a.review.tags).toEqual(["artist"]);
});

test("normalization migrates legacy review fields into v6 review + actions", () => {
  const old = {
    schema_version: 5,
    status_semantics: { old: true },
    tag_options: ["artist"],
    accounts: {
      alice: {
        username: "alice",
        current: { you_follow: true, follows_you: false, relationship: "not_following_back" },
        review: {
          reviewed: true,
          deleted_or_unavailable: false,
          manual_unfollowed_now: true,
          manual_unfollowed_marked_at: "2026-09-01T10:00:00Z",
          manual_unfollow_confirmed_snapshot_id: null,
          decision: "unfollowed",
          tags: ["artist", "photographer"],
          notes: "legacy",
        },
      },
    },
    snapshots: [],
    actions: [{
      type: "manual_unfollow",
      status: "confirmed",
      username: "older",
      marked_at: "2026-01-01T00:00:00Z",
      confirmed_at: "2026-01-02T00:00:00Z",
      confirmation_snapshot_id: "legacy_snapshot",
    }],
  };

  const { next, changed } = normalizeMaster(old);
  expect(changed).toBe(true);
  expect(next.schema_version).toBe(SCHEMA_VERSION);
  expect(next.status_semantics).toEqual(STATUS_SEMANTICS);
  expect(next.accounts.alice?.review).toEqual({
    reviewed: true,
    last_reviewed_at: null,
    deleted_or_unavailable: false,
    tags: ["artist", "photographer"],
    notes: "legacy",
  });
  expect(next.tag_options).toContain("photographer");
  expect(pendingAction(next, "alice", "unfollow")).toBeTruthy();
  expect(next.actions.find(a => a.username === "older")?.type).toBe("unfollow");
  expect(next.actions.every(a => a.action_id)).toBe(true);
});

test("legacy pending unfollow can be confirmed by the latest saved snapshot after migration", () => {
  const old = {
    schema_version: 3,
    accounts: {
      alice: {
        username: "alice",
        current: { you_follow: false, follows_you: false, relationship: "neither" },
        review: { reviewed: true, deleted_or_unavailable: false, manual_unfollowed_now: true, tags: [], notes: "" },
      },
    },
    tag_options: [],
    snapshots: [{
      snapshot_id: "snapshot_latest",
      snapshot_date: "2026-09-04",
      captured_at: null,
      source_files: [],
      following: {},
      followers: {},
      changes_from_previous_snapshot: { stopped_following: ["alice"], lost_followers: [] },
    }],
  };

  const { next } = normalizeMaster(old);
  const alice = next.accounts.alice;
  if (!alice) throw new Error("alice missing");
  syncCurrentRelationship(alice, null, null);
  const result = confirmPendingActions(next, next.snapshots[0] ?? null, "2099-01-01T00:00:00Z");
  expect(result.unfollow).toBe(1);
  const action = next.actions.find(a => a.username === "alice");
  expect(action?.status).toBe("confirmed");
  expect(action?.confirmed_at, "legacy date-only snapshot must not invent an exact confirmation time").toBeNull();
  expect(action?.confirmation_snapshot_date).toBe("2026-09-04");
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
  expect(merged.find(x => x.username.toLowerCase() === "alice")?.timestamp).toBe(30);
});

test("review query can combine scope, tag and status", () => {
  const a = account("artist_reviewed");
  a.review.tags = ["artist"];
  markReviewed(a, true, "2026-09-01T00:00:00Z");
  syncCurrentRelationship(a, { username: a.username }, { username: a.username });

  const b = account("artist_pending");
  b.review.tags = ["artist"];
  syncCurrentRelationship(b, { username: b.username }, null);

  const c = account("friend_pending");
  c.review.tags = ["friend"];
  syncCurrentRelationship(c, { username: c.username }, null);

  const state = stateWith(a, b, c);
  const result = reviewScopeAccounts(state, { scope: "following", tag: tag("artist"), reviewStatus: "needs_review" });
  expect(result.map(x => x.username)).toEqual(["artist_pending"]);
});

test("normalizeReview repairs malformed optional fields without inventing review history", () => {
  const review = normalizeReview({ reviewed: 1, tags: ["artist", "artist", "", null], notes: null });
  expect(review.reviewed).toBe(true);
  expect(review.last_reviewed_at).toBeNull();
  expect(review.tags).toEqual(["artist"]);
  expect(review.notes).toBe("");
});

test("session diff reports only net review, tag, action and metadata changes", () => {
  const a = account("alice");
  a.review.tags = ["artist"];
  a.review.notes = "before";
  syncCurrentRelationship(a, { username: "alice" }, { username: "alice" });
  const baseline = stateWith(a);

  const current = structuredClone(baseline);
  const currentAlice = current.accounts.alice;
  if (!currentAlice) throw new Error("alice missing");
  markReviewed(currentAlice, true, "2026-09-05T18:00:00Z");
  currentAlice.review.tags = ["artist", "photography"];
  currentAlice.review.notes = "after";
  addPendingAction(current, currentAlice, "unfollow", "2026-09-05T18:05:00Z");

  const diff = buildSessionDiff(baseline, current);
  expect(diff.changedAccounts).toBe(1);
  expect(diff.changeCount).toBe(4);
  expect(diff.summary).toEqual({ reviews: 1, tags: 1, actions: 1, other: 1 });
  expect(diff.tagsAdded).toEqual([{ tag: "photography", count: 1 }]);
  const changes = diff.accounts[0]?.changes ?? [];
  expect(changes.some(change => change.type === "reviewed")).toBe(true);
  expect(changes.some(change => change.type === "tag_added" && change.tag === "photography")).toBe(true);
  expect(changes.some(change => change.type === "unfollow_pending")).toBe(true);
  expect(changes.some(change => change.type === "note_edited")).toBe(true);
});

test("session diff ignores tag edits that end back at baseline but keeps persistent last-reviewed changes", () => {
  const a = account("alice");
  a.review.tags = ["artist"];
  syncCurrentRelationship(a, { username: "alice" }, null);
  const baseline = stateWith(a);
  const current = structuredClone(baseline);
  const currentAlice = current.accounts.alice;
  if (!currentAlice) throw new Error("alice missing");

  currentAlice.review.tags.push("fashion");
  currentAlice.review.tags = ["artist"];
  markReviewed(currentAlice, true, "2026-09-05T18:00:00Z");
  markReviewed(currentAlice, false, "2026-09-05T18:01:00Z");

  const diff = buildSessionDiff(baseline, current);
  expect(diff.changedAccounts).toBe(1);
  expect(diff.changeCount).toBe(1);
  expect(diff.accounts[0]?.changes[0]?.type).toBe("last_reviewed_updated");
});

test("session diff groups tag additions across accounts for review", () => {
  const a = account("alice");
  const b = account("bob");
  syncCurrentRelationship(a, { username: "alice" }, null);
  syncCurrentRelationship(b, { username: "bob" }, null);
  const baseline: Pick<Master, "accounts" | "actions"> = stateWith(a, b);
  const current = structuredClone(baseline);
  if (!current.accounts.alice || !current.accounts.bob) throw new Error("accounts missing");
  current.accounts.alice.review.tags = ["artist"];
  current.accounts.bob.review.tags = ["artist", "photography"];

  const diff = buildSessionDiff(baseline, current);
  expect(diff.tagsAdded).toEqual([
    { tag: "artist", count: 2 },
    { tag: "photography", count: 1 },
  ]);
  expect(diff.summary.tags).toBe(3);
  expect(diff.changedAccounts).toBe(2);
});

test("action stats count pending and confirmed actions per type", () => {
  const a = account();
  syncCurrentRelationship(a, { username: "alice" }, { username: "alice" });
  const state = stateWith(a);
  addPendingAction(state, a, "unfollow", "2026-09-01T10:00:00Z");
  addPendingAction(state, a, "remove_follower", "2026-09-01T10:00:00Z");
  expect(actionStats(state)).toEqual({ pendingUnfollow: 1, pendingRemoveFollower: 1, confirmedUnfollow: 0, confirmedRemoveFollower: 0 });
});
