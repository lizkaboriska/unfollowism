import {
  DEFAULT_TAG_OPTIONS,
  ImportError,
  MasterFormatError,
  actionIneligibility,
  actionStats,
  buildImportMessage,
  buildSessionDiff,
  importExport,
  createReview,
  parseMaster,
  stringifyMasterFile,
  toMasterFile,
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

describe("master file", () => {
  /** A saved master file as it comes out of JSON.parse, with one reviewed account and a pending action. */
  function saved(): Record<string, unknown> & { accounts: Record<string, Record<string, unknown>> } {
    const master = freshMaster();
    must(master.accounts.bob).review = { reviewed: true, last_reviewed_at: T1, deleted_or_unavailable: false, tags: ["artist"], notes: "" };
    must(master.accounts.bob).actions.pending.push("unfollow");
    return JSON.parse(stringifyMasterFile(toMasterFile({ ...master, last_saved_at: T2 }))) as ReturnType<typeof saved>;
  }

  test("is compact: defaults and derivable fields are left out", () => {
    const file = saved();
    expect(file.accounts).toEqual({
      alice: { username: "Alice", following_since: 1_700_000_000, follower_since: 1_700_000_000 },
      bob: {
        username: "bob", following_since: 1_700_000_000,
        review: { reviewed: true, last_reviewed_at: T1, deleted_or_unavailable: false, tags: ["artist"], notes: "" },
        actions: { pending: ["unfollow"], confirmed: [] },
      },
      carol: { username: "carol", follower_since: 1_700_000_000 },
    });
    expect(file.last_import_at).toBe(T1);
  });

  test("round-trips: parse then save gives the same file", () => {
    const file = saved();
    expect(JSON.parse(stringifyMasterFile(toMasterFile(parseMaster(file))))).toEqual(file);
  });

  test("reading restores the derived relationship", () => {
    const master = parseMaster(saved());
    expect(master.accounts.alice?.current).toEqual({
      you_follow: true, follows_you: true, relationship: "mutual", following_since_timestamp: 1_700_000_000, follower_since_timestamp: 1_700_000_000,
    });
    expect(master.accounts.carol?.current.relationship).toBe("follows_you_only");
    expect(master.accounts.alice?.review).toEqual(createReview());
  });

  test("a follow without a known time is kept as null, not dropped", () => {
    const file = saved();
    must(file.accounts.carol).following_since = null;
    expect(parseMaster(file).accounts.carol?.current).toMatchObject({ you_follow: true, following_since_timestamp: null });
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
    (must(raw.accounts.bob).review as { tags: unknown }).tags = "artist";
    expect(() => parseMaster(raw)).toThrow("Invalid master file: accounts.bob.review.tags should be a list.");

    const raw2 = saved();
    (must(raw2.accounts.bob).actions as { pending: unknown[] }).pending.push("block");
    expect(() => parseMaster(raw2)).toThrow("accounts.bob.actions.pending[1] should be one of unfollow, remove_follower");

    const raw3 = saved();
    (must(raw3.accounts.bob).actions as { pending: unknown[] }).pending.push("unfollow");
    expect(() => parseMaster(raw3)).toThrow("accounts.bob.actions.pending should be a list without duplicates");

    const raw4 = saved();
    must(raw4.accounts.alice).following_since = "yesterday";
    expect(() => parseMaster(raw4)).toThrow("accounts.alice.following_since should be a number or null");
  });

  test("drops fields the app does not use", () => {
    const parsed = parseMaster({ ...saved(), notes_from_elsewhere: "x" });
    expect(Object.keys(toMasterFile(parsed))).toEqual(["version", "last_saved_at", "last_import_at", "tag_options", "accounts"]);
  });

  test("does not mutate its input", () => {
    const raw = saved();
    const before = JSON.stringify(raw);
    parseMaster(raw);
    expect(JSON.stringify(raw)).toBe(before);
  });

  test("usernames that collide with Object.prototype members are ordinary accounts", () => {
    const raw = saved();
    const accounts = JSON.parse("{}") as Record<string, unknown>;
    for (const name of ["constructor", "__proto__", "toString"]) Object.defineProperty(accounts, name, { value: { username: name }, enumerable: true });
    const parsed = parseMaster({ ...raw, accounts });
    expect(Object.keys(parsed.accounts).sort()).toEqual(["__proto__", "constructor", "tostring"]);
    const key: string = "constructor";
    expect(parsed.accounts[key]?.username).toBe("constructor");
  });

  test("rejects an account listed twice under different casing", () => {
    const raw = saved();
    raw.accounts.BOB = { ...raw.accounts.bob, username: "BOB" };
    expect(() => parseMaster(raw)).toThrow('account "BOB" appears twice');
  });
});

describe("importExport", () => {
  test("first-time user: new master, nothing to compare with yet", () => {
    const result = importExport(null, bundle(followingFile(["Alice", 100], ["bob", 200]), followersFile(["alice", 300]), followersFile(["carol", 400])), T1);
    expect(result.isNewMaster).toBe(true);
    expect(result.dirty).toBe(true);
    expect(result.master.tag_options).toEqual(DEFAULT_TAG_OPTIONS);
    expect(result.master.last_import_at).toBe(T1);
    expect(result.master.accounts.alice?.current).toEqual({
      you_follow: true, follows_you: true, relationship: "mutual", following_since_timestamp: 100, follower_since_timestamp: 300,
    });
    expect(result.master.accounts.carol?.current.relationship).toBe("follows_you_only");
    expect(Object.values(result.master.accounts).some(a => a.follower_change)).toBe(false); // no "new followers" on day one
  });

  test("re-importing the same export is not dirty and keeps the last import's markers and time", () => {
    const earlier = importExport(JSON.parse(stringifyMasterFile(toMasterFile(freshMaster()))), bundle(followingFile(["Alice"]), followersFile(["alice"], ["dave"])), T1).master;
    const saved = JSON.parse(stringifyMasterFile(toMasterFile(earlier))) as unknown;
    const result = importExport(saved, bundle(followingFile(["Alice"]), followersFile(["alice"], ["dave"])), T2);
    expect(result.exportChanged).toBe(false);
    expect(result.dirty).toBe(false);
    expect(result.master.last_import_at).toBe(T1);
    expect(result.master.accounts.dave?.follower_change).toBe("new");
    expect(result.changes.new_followers).toEqual(["dave"]);
  });

  test("a later export updates relationships, marks new/lost followers and keeps review data", () => {
    const saved = freshMaster();
    must(saved.accounts.bob).review = { reviewed: true, last_reviewed_at: T1, deleted_or_unavailable: false, tags: ["artist"], notes: "hi" };
    const result = importExport(JSON.parse(stringifyMasterFile(toMasterFile(saved))), bundle(followingFile(["alice"]), followersFile(["alice"], ["dave"])), T2);

    expect(result.exportChanged).toBe(true);
    expect(result.changes).toEqual({ newly_following: [], stopped_following: ["bob"], new_followers: ["dave"], lost_followers: ["carol"] });
    expect(result.master.accounts.dave?.follower_change).toBe("new");
    expect(result.master.accounts.carol?.follower_change).toBe("lost");
    expect(result.master.accounts.alice?.follower_change).toBeUndefined();
    expect(result.master.accounts.bob?.current.relationship).toBe("neither");
    expect(result.master.accounts.bob?.review.notes).toBe("hi");
    expect(result.master.accounts.alice?.username).toBe("alice"); // casing follows the newest export
    expect(result.master.last_import_at).toBe(T2);
  });

  test("the next changed export replaces the markers", () => {
    const second = importExport(JSON.parse(stringifyMasterFile(toMasterFile(freshMaster()))), bundle(followingFile(["alice"]), followersFile(["alice"], ["dave"])), T2).master;
    const third = importExport(JSON.parse(stringifyMasterFile(toMasterFile(second))), bundle(followingFile(["alice"]), followersFile(["dave"], ["erin"])), T2).master;
    expect(Object.entries(third.accounts).filter(([, a]) => a.follower_change).map(([k, a]) => [k, a.follower_change])).toEqual([["alice", "lost"], ["erin", "new"]]);
  });

  test("rejects exports with an empty side", () => {
    expect(() => importExport(null, bundle(followingFile(), followersFile(["a"])), T1)).toThrow(ImportError);
    expect(() => importExport(null, bundle(followingFile(["a"])), T1)).toThrow(ImportError);
  });
});

describe("parsing", () => {
  test("following: username from title, missing timestamp → null", () => {
    expect(parseFollowingJson({ relationships_following: [{ title: "x", string_list_data: [{ href: "https://www.instagram.com/_u/x" }] }, { title: "" }, null] }))
      .toEqual([{ username: "x", timestamp: null }]);
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
  const changed = { ...base, isNewMaster: false, exportChanged: true, changes: { ...base.changes, new_followers: ["x", "y"], lost_followers: ["z"] } };

  test.each([
    ["new master", base, "Started a new master from 1 follower file. 1 following, 1 followers. Save master to keep it."],
    ["changed export", { ...changed, confirmed: { unfollow: 2, remove_follower: 1, total: 3 } },
      "New export loaded from 1 follower file — not saved yet. 1 following, 1 followers. Since the last import: 2 new followers, 1 lost follower. Confirmed 2 unfollows and 1 follower removal."],
    ["same export", { ...changed, exportChanged: false },
      "Loaded 1 follower file: same as the last import. 1 following, 1 followers. From that import: 2 new followers, 1 lost follower."],
  ])("%s", (_, result, expected) => {
    expect(buildImportMessage(result)).toBe(expected);
  });
});
