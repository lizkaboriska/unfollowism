import {
  ACTION_TYPES,
  PLAN_STATES,
  createAccount,
  importExport,
  mergeRenamed,
  parseFollowersJson,
  parseFollowingJson,
  stringifyMasterFile,
  toMasterFile,
  type ExportBundle,
  type Master,
} from "../index.ts";
import { followersFile, followingFile, must } from "./helpers.ts";

const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-20T10:00:00.000Z";
const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;

type Entries = [string, number][];
const bundle = (following: Entries, followers: Entries): ExportBundle => ({
  following: parseFollowingJson(followingFile(...following)),
  followers: parseFollowersJson(followersFile(...followers)),
  followerFileCount: 1,
});
const asFile = (master: Master): unknown => JSON.parse(stringifyMasterFile(toMasterFile(master)));

/** First import: alice (mutual), bob (I follow), carol (follows me), each with its own dates. */
function first(edit: (master: Master) => void = () => undefined): unknown {
  const { master } = importExport(null, bundle([["alice", 101], ["bob", 102]], [["alice", 201], ["carol", 203]]), T1);
  edit(master);
  return asFile(master);
}

test("a mutual account that renamed is matched by both follow dates", () => {
  const result = importExport(first(), bundle([["alice_new", 101], ["bob", 102]], [["alice_new", 201], ["carol", 203]]), T2);
  expect(result.renames).toEqual([{ from: "alice", to: "alice_new", plans: [] }]);
});

test("an account that only follows me is matched by its follower date", () => {
  const result = importExport(first(), bundle([["alice", 101], ["bob", 102]], [["alice", 201], ["carol_2", 203]]), T2);
  expect(result.renames).toEqual([{ from: "carol", to: "carol_2", plans: [] }]);
});

test("no suggestion when a date differs, the follow directions differ, or a date is unknown", () => {
  const otherDate = importExport(first(), bundle([["alice", 101], ["bob", 102]], [["alice", 201], ["carol_2", 999]]), T2);
  expect(otherDate.renames).toEqual([]);

  // alice was mutual; the new name only follows me (same follower date).
  const oneWay = importExport(first(), bundle([["bob", 102]], [["alice_new", 201], ["carol", 203]]), T2);
  expect(oneWay.renames).toEqual([]);

  const noDates = (names: string[]): ExportBundle => ({
    following: [{ username: "me", since: 1 }],
    followers: names.map(username => ({ username, since: null })),
    followerFileCount: 1,
  });
  const { master } = importExport(null, noDates(["dana"]), T1);
  expect(importExport(asFile(master), noDates(["dana_2"]), T2).renames).toEqual([]);
});

test("no suggestion when two accounts share the dates", () => {
  const { master } = importExport(null, bundle([["me", 1]], [["dana", 300], ["erin", 300]]), T1);
  const result = importExport(asFile(master), bundle([["me", 1]], [["new_one", 300]]), T2);
  expect(result.renames).toEqual([]);
});

test("an account I follow that stopped following me but is still followed is no rename", () => {
  const result = importExport(first(), bundle([["alice", 101], ["bob", 102]], [["alice_new", 201], ["carol", 203]]), T2);
  expect(result.renames).toEqual([]);
});

test("an account only I follow is never suggested (it shows in I unfollowed)", () => {
  const result = importExport(first(), bundle([["alice", 101], ["bob_new", 102]], [["alice", 201], ["carol", 203]]), T2);
  expect(result.renames).toEqual([]);
});

test("plans on a renamed account are remembered and not reported as done", () => {
  const raw = first(master => {
    must(master.accounts.alice).toUnfollow = PLAN_STATES.PLANNED;
    must(master.accounts.alice).toRemove = PLAN_STATES.DONE;
    must(master.accounts.bob).toUnfollow = PLAN_STATES.PLANNED;
  });
  const result = importExport(raw, bundle([["alice_new", 101]], [["alice_new", 201], ["carol", 203]]), T2);
  expect(result.renames).toEqual([{ from: "alice", to: "alice_new", plans: [UNFOLLOW, REMOVE_FOLLOWER] }]);
  expect(result.summary.plans.completed).toEqual({ [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 }); // only bob's unfollow
  expect(result.master.accounts.alice?.toUnfollow).toBeUndefined();
});

test("confirming moves tags, notes, reviewed and plans to the new name", () => {
  const target = createAccount("alice_new");
  target.following = { since: 101 };
  target.followedBy = { since: 201 };
  target.review.tags = ["friend"];
  target.review.notes = "new note";
  const old = createAccount("alice");
  old.review = { reviewed: true, unavailable: true, tags: ["artist", "friend"], notes: "old note" };

  mergeRenamed(target, old, [UNFOLLOW, REMOVE_FOLLOWER]);
  expect(target.review).toEqual({ reviewed: true, unavailable: false, tags: ["friend", "artist"], notes: "new note\nold note" });
  expect(target.toUnfollow).toBe(PLAN_STATES.PLANNED);
  expect(target.toRemove).toBe(PLAN_STATES.PLANNED);

  const followerOnly = createAccount("carol_2");
  followerOnly.followedBy = { since: 203 };
  mergeRenamed(followerOnly, createAccount("carol"), [UNFOLLOW]);
  expect(followerOnly.toUnfollow).toBeUndefined(); // I don't follow the new name: nothing to unfollow
});
