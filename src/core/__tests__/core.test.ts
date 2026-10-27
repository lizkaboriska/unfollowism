import {
  DEFAULT_TAG_OPTIONS,
  ImportError,
  MasterFormatError,
  actionIneligibility,
  actionStats,
  buildImportMessage,
  buildSessionDiff,
  importExport,
  parseMaster,
  parseFollowersJson,
  parseFollowingJson,
  isPending,
  relationshipStats,
  reviewScopeAccounts,
  reviewScopeStats,
  reviewStatusMatches,
  scopeMatches,
  tagMatches,
  type ExportBundle,
  type Master,
} from "../index.ts";
import { deepFreeze, followersFile, followingFile, must } from "./helpers.ts";

const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-20T10:00:00.000Z";

function bundle(following: ReturnType<typeof followingFile>, ...followerFiles: ReturnType<typeof followersFile>[]): ExportBundle {
  return {
    following: parseFollowingJson(following),
    followers: followerFiles.flatMap(parseFollowersJson),
    followerFileCount: followerFiles.length,
  };
}

function freshMaster(): Master {
  return importExport(null, bundle(followingFile(["Alice"], ["bob"]), followersFile(["alice"], ["carol"])), T1).master;
}

describe("read functions never write (safe on frozen Redux state)", () => {
  test("all selectors-side helpers work on a deep-frozen master", () => {
    const master = freshMaster();
    must(master.accounts.alice).review.tags = ["artist"];
    must(master.accounts.bob).actions = { pending: ["unfollow"], confirmed: ["unfollow"] };
    const frozen = deepFreeze(master);
    const alice = must(frozen.accounts.alice);

    expect(() => {
      scopeMatches(alice, "mutual");
      tagMatches(alice, { kind: "tag", tag: "artist" });
      tagMatches(alice, { kind: "untagged" });
      reviewStatusMatches(alice, "needs_review");
      reviewScopeAccounts(frozen, { scope: "all_accounts", tag: { kind: "all" }, reviewStatus: "all", query: "a" });
      reviewScopeStats(frozen, { scope: "following" });
      relationshipStats(frozen);
      actionStats(frozen);
      isPending(alice, "unfollow");
      actionIneligibility(alice, "remove_follower");
      buildSessionDiff(frozen, frozen);
    }).not.toThrow();
  });
});

describe("parseMaster", () => {
  /** A saved master as it comes out of JSON.parse. */
  const saved = (): Record<string, unknown> => JSON.parse(JSON.stringify({ ...freshMaster(), last_saved_at: T2 })) as Record<string, unknown>;

  test("a saved master parses back to the same data", () => {
    const raw = saved();
    expect(JSON.parse(JSON.stringify(parseMaster(raw)))).toEqual(raw);
  });

  test("rejects input that is not a master", () => {
    expect(() => parseMaster(null)).toThrow("not an Instagram Review master");
    expect(() => parseMaster([])).toThrow(MasterFormatError);
    expect(() => parseMaster({ following: [] })).toThrow(MasterFormatError);
  });

  test("rejects other format versions with a clear message", () => {
    expect(() => parseMaster({ ...saved(), version: 2 })).toThrow("This file wasn't saved by a compatible version of Instagram Review.");
    expect(() => parseMaster({ ...saved(), version: undefined })).toThrow(MasterFormatError);
  });

  test("names the exact field that is wrong instead of silently repairing it", () => {
    const raw = saved();
    must((raw.accounts as Record<string, { review: { tags: unknown } } | undefined>).bob).review.tags = "artist";
    expect(() => parseMaster(raw)).toThrow("Invalid master file: accounts.bob.review.tags should be a list.");

    const raw2 = saved();
    must((raw2.accounts as Record<string, { actions: { pending: unknown[] } } | undefined>).bob).actions.pending.push("block");
    expect(() => parseMaster(raw2)).toThrow("accounts.bob.actions.pending[0] should be one of unfollow, remove_follower");

    const raw3 = saved();
    must((raw3.accounts as Record<string, { actions: { confirmed: unknown[] } } | undefined>).bob).actions.confirmed.push("unfollow", "unfollow");
    expect(() => parseMaster(raw3)).toThrow("accounts.bob.actions.confirmed should be a list without duplicates");
  });

  test("drops fields the app does not use", () => {
    const raw = { ...saved(), notes_from_elsewhere: "x", extra: [1] };
    const parsed = parseMaster(raw) as unknown as Record<string, unknown>;
    expect(Object.keys(parsed)).toEqual(["version", "tag_options", "accounts", "snapshots", "last_saved_at"]);
  });

  test("does not mutate its input", () => {
    const raw = saved();
    const before = JSON.stringify(raw);
    parseMaster(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  test("usernames that collide with Object.prototype members are ordinary accounts", () => {
    const raw = saved();
    const template = (raw.accounts as Record<string, Record<string, unknown>>).bob;
    const accounts = JSON.parse("{}") as Record<string, unknown>;
    for (const name of ["constructor", "__proto__", "toString"]) Object.defineProperty(accounts, name, { value: { ...template, username: name }, enumerable: true });
    const parsed = parseMaster({ ...raw, accounts });
    expect(Object.keys(parsed.accounts).sort()).toEqual(["__proto__", "constructor", "tostring"]);
    const key: string = "constructor";
    expect(parsed.accounts[key]?.username).toBe("constructor");
  });

  test("rejects an account listed twice under different casing", () => {
    const raw = saved();
    const accounts = raw.accounts as Record<string, Record<string, unknown>>;
    accounts.BOB = { ...accounts.bob, username: "BOB" };
    expect(() => parseMaster(raw)).toThrow('account "BOB" appears twice');
  });
});

describe("importExport", () => {
  test("first-time user: new master with snapshot #1", () => {
    const result = importExport(null, bundle(followingFile(["Alice", 100], ["bob", 200]), followersFile(["alice", 300]), followersFile(["carol", 400])), T1);
    expect(result.isNewMaster).toBe(true);
    expect(result.dirty).toBe(true);
    expect(result.snapshotCreated).toBe(true);
    expect(result.master.snapshots).toHaveLength(1);
    expect(result.master.tag_options).toEqual(DEFAULT_TAG_OPTIONS);
    expect(result.master.snapshots[0]).toEqual({ captured_at: T1, following: ["Alice", "bob"], followers: ["alice", "carol"] }); // first: no changes
    expect(result.master.accounts.alice?.current).toEqual({
      you_follow: true, follows_you: true, relationship: "mutual", following_since_timestamp: 100, follower_since_timestamp: 300,
    });
    expect(result.master.accounts.alice?.url).toBe("https://www.instagram.com/Alice");
    expect(result.master.accounts.carol?.current.relationship).toBe("follows_you_only");
    expect(result.changes.newly_following).toEqual(["Alice", "bob"]);
  });

  test("re-importing the same export is not dirty and adds no snapshot", () => {
    const saved = JSON.parse(JSON.stringify(freshMaster())) as unknown;
    const result = importExport(saved, bundle(followingFile(["Alice"], ["bob"]), followersFile(["alice"], ["carol"])), T2);
    expect(result.snapshotCreated).toBe(false);
    expect(result.dirty).toBe(false);
    expect(result.master.snapshots).toHaveLength(1);
  });

  test("a later export updates relationships, keeps history and review data", () => {
    const saved = freshMaster();
    must(saved.accounts.bob).review = { reviewed: true, last_reviewed_at: T1, deleted_or_unavailable: false, tags: ["artist"], notes: "hi" };
    const result = importExport(JSON.parse(JSON.stringify(saved)), bundle(followingFile(["alice"]), followersFile(["alice"], ["dave"])), T2);

    expect(result.snapshotCreated).toBe(true);
    expect(result.changes).toEqual({ newly_following: [], stopped_following: ["bob"], new_followers: ["dave"], lost_followers: ["carol"] });
    expect(result.master.accounts.bob?.current.relationship).toBe("neither");
    expect(result.master.accounts.bob?.review.notes).toBe("hi");
    expect(result.master.accounts.alice?.username).toBe("alice"); // casing follows the newest export
    expect(result.master.snapshots.map(s => s.captured_at)).toEqual([T1, T2]);
    expect(result.master.snapshots[1]?.changes).toEqual(result.changes);
  });

  test("rejects exports with an empty side", () => {
    expect(() => importExport(null, bundle(followingFile(), followersFile(["a"])), T1)).toThrow(ImportError);
    expect(() => importExport(null, bundle(followingFile(["a"])), T1)).toThrow(ImportError);
  });
});

describe("parsing", () => {
  test("following: username from title, /_u/ links normalized, missing timestamp → null", () => {
    expect(parseFollowingJson({ relationships_following: [{ title: "x", string_list_data: [{ href: "https://www.instagram.com/_u/x" }] }, { title: "" }, null] }))
      .toEqual([{ username: "x", url: "https://www.instagram.com/x", timestamp: null }]);
  });

  test("followers: username from value, falls back to title", () => {
    expect(parseFollowersJson([{ title: "t", string_list_data: [] }, { string_list_data: [{ value: "v", timestamp: 5 }] }]).map(a => a.username)).toEqual(["t", "v"]);
  });

  test("wrong shapes yield no accounts instead of throwing", () => {
    expect(parseFollowingJson("nope")).toEqual([]);
    expect(parseFollowersJson({ relationships_following: [] })).toEqual([]);
  });
});

describe("tag filter", () => {
  test("a real tag named 'untagged' is distinct from the Untagged filter", () => {
    const master = freshMaster();
    const alice = must(master.accounts.alice);
    alice.review.tags = ["untagged"];
    expect(tagMatches(alice, { kind: "tag", tag: "untagged" })).toBe(true);
    expect(tagMatches(alice, { kind: "untagged" })).toBe(false);
  });
});

describe("buildImportMessage", () => {
  const base = importExport(null, bundle(followingFile(["a"]), followersFile(["a"])), T1);

  test.each([
    ["new master", base, "Started a new master from 1 follower file. 1 following, 1 followers. Save master to keep it."],
    ["new snapshot", { ...base, isNewMaster: false, confirmed: { unfollow: 2, remove_follower: 1, total: 3 } },
      "New snapshot detected — not saved. Loaded 1 follower file. 1 following, 1 followers. Changes: +1 following, -0 following, +1 followers, -0 followers. Confirmed 2 unfollows and 1 follower removal."],
    ["confirmations only", { ...base, isNewMaster: false, snapshotCreated: false, confirmed: { unfollow: 1, remove_follower: 0, total: 1 } },
      "Loaded 1 follower file. The export matches the latest snapshot. Confirmed 1 unfollow and 0 follower removals. Save master to keep the updated action history."],
    ["up to date", { ...base, isNewMaster: false, snapshotCreated: false },
      "Loaded 1 follower file; up to date. Latest saved changes: +1 following, -0 following, +1 followers, -0 followers."],
  ])("%s", (_, result, expected) => {
    expect(buildImportMessage(result)).toBe(expected);
  });
});
