import {
  ACTION_TYPES,
  DEFAULT_TAG_OPTIONS,
  FOLLOWER_CHANGES,
  ImportError,
  MasterFormatError,
  RELATIONSHIPS,
  REVIEW_SCOPES,
  REVIEW_STATUSES,
  TAG_FILTER_KINDS,
  actionIneligibility,
  actionStats,
  buildSessionDiff,
  createReview,
  importExport,
  isPending,
  parseFollowersJson,
  parseFollowingJson,
  parseMaster,
  relationshipOf,
  relationshipStats,
  reviewScopeAccounts,
  reviewScopeStats,
  reviewStatusMatches,
  scopeMatches,
  stringifyMasterFile,
  tagMatches,
  toMasterFile,
  type ExportBundle,
  type Master,
} from "../index.ts";
import { deepFreeze, followersFile, followingFile, must } from "./helpers.ts";

const T1 = "2026-10-01T10:00:00.000Z";
const T2 = "2026-10-20T10:00:00.000Z";
const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;

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

/** Master → saved file → JSON, as a later import would read it. */
const asFile = (master: Master): unknown => JSON.parse(stringifyMasterFile(toMasterFile(master)));

describe("read functions never write (safe on frozen Redux state)", () => {
  test("all selector-side helpers work on a deep-frozen master", () => {
    const master = freshMaster();
    must(master.accounts.alice).review.tags = ["artist"];
    must(master.accounts.bob).actions = { pending: [UNFOLLOW], confirmed: [UNFOLLOW] };
    const frozen = deepFreeze(master);
    const alice = must(frozen.accounts.alice);

    expect(() => {
      relationshipOf(alice);
      scopeMatches(alice, REVIEW_SCOPES.MUTUAL);
      tagMatches(alice, { kind: TAG_FILTER_KINDS.TAG, tag: "artist" });
      tagMatches(alice, { kind: TAG_FILTER_KINDS.UNTAGGED });
      reviewStatusMatches(alice, REVIEW_STATUSES.NEEDS_REVIEW);
      reviewScopeAccounts(frozen, { scope: REVIEW_SCOPES.ALL_ACCOUNTS, tag: { kind: TAG_FILTER_KINDS.ALL }, reviewStatus: REVIEW_STATUSES.ALL, query: "a" });
      reviewScopeStats(frozen, { scope: REVIEW_SCOPES.FOLLOWING });
      relationshipStats(frozen);
      actionStats(frozen);
      isPending(alice, UNFOLLOW);
      actionIneligibility(alice, REMOVE_FOLLOWER);
      buildSessionDiff(frozen.accounts, frozen.accounts);
    }).not.toThrow();
  });
});

describe("master file", () => {
  /** A saved master file as it comes out of JSON.parse, with one reviewed account and a pending action. */
  function saved(): Record<string, unknown> & { accounts: Record<string, Record<string, unknown>> } {
    const master = freshMaster();
    must(master.accounts.bob).review = { reviewed: true, lastReviewedAt: T1, unavailable: false, tags: ["artist"], notes: "" };
    must(master.accounts.bob).actions.pending.push(UNFOLLOW);
    return asFile({ ...master, lastSavedAt: T2 }) as ReturnType<typeof saved>;
  }

  test("is compact: defaults and derivable fields are left out", () => {
    const file = saved();
    expect(file.accounts).toEqual({
      alice: { username: "Alice", followingSince: 1_700_000_000, followerSince: 1_700_000_000 },
      bob: {
        username: "bob", followingSince: 1_700_000_000,
        review: { reviewed: true, lastReviewedAt: T1, unavailable: false, tags: ["artist"], notes: "" },
        actions: { pending: [UNFOLLOW], confirmed: [] },
      },
      carol: { username: "carol", followerSince: 1_700_000_000 },
    });
    expect(file.lastImportAt).toBe(T1);
  });

  test("round-trips: parse then save gives the same file", () => {
    const file = saved();
    expect(asFile(parseMaster(file))).toEqual(file);
  });

  test("reading restores follows; the relationship is derived from them", () => {
    const master = parseMaster(saved());
    const alice = must(master.accounts.alice);
    expect(alice.following).toEqual({ since: 1_700_000_000 });
    expect(alice.followedBy).toEqual({ since: 1_700_000_000 });
    expect(relationshipOf(alice)).toBe(RELATIONSHIPS.MUTUAL);
    expect(relationshipOf(must(master.accounts.carol))).toBe(RELATIONSHIPS.FOLLOWS_YOU_ONLY);
    expect(alice.review).toEqual(createReview());
  });

  test("a follow without a known time is kept (since: null), not dropped", () => {
    const file = saved();
    must(file.accounts.carol).followingSince = null;
    expect(parseMaster(file).accounts.carol?.following).toEqual({ since: null });
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
    expect(() => parseMaster(raw2)).toThrow("accounts.bob.actions.pending[1] should be one of unfollow, removeFollower");

    const raw3 = saved();
    (must(raw3.accounts.bob).actions as { pending: unknown[] }).pending.push(UNFOLLOW);
    expect(() => parseMaster(raw3)).toThrow("accounts.bob.actions.pending should be a list without duplicates");

    const raw4 = saved();
    must(raw4.accounts.alice).followingSince = "yesterday";
    expect(() => parseMaster(raw4)).toThrow("accounts.alice.followingSince should be a number or null");

    const raw5 = saved();
    must(raw5.accounts.alice).followerChange = "maybe";
    expect(() => parseMaster(raw5)).toThrow("accounts.alice.followerChange should be one of new, lost");
  });

  test("drops fields the app does not use", () => {
    const parsed = parseMaster({ ...saved(), notesFromElsewhere: "x" });
    expect(Object.keys(toMasterFile(parsed))).toEqual(["version", "lastSavedAt", "lastImportAt", "tagOptions", "accounts"]);
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
    expect(result.master.tagOptions).toEqual(DEFAULT_TAG_OPTIONS);
    expect(result.master.lastImportAt).toBe(T1);
    expect(must(result.master.accounts.alice).following).toEqual({ since: 100 });
    expect(must(result.master.accounts.alice).followedBy).toEqual({ since: 300 });
    expect(relationshipOf(must(result.master.accounts.carol))).toBe(RELATIONSHIPS.FOLLOWS_YOU_ONLY);
    expect(Object.values(result.master.accounts).some(a => a.followerChange)).toBe(false); // no "new followers" on day one
    expect(result.summary).toMatchObject({ newFollowers: 0, lostFollowers: 0, followingCount: 2, followersCount: 2 });
  });

  test("re-importing the same export is not dirty and keeps the last import's markers and time", () => {
    const earlier = importExport(asFile(freshMaster()), bundle(followingFile(["Alice"]), followersFile(["alice"], ["dave"])), T1).master;
    const result = importExport(asFile(earlier), bundle(followingFile(["Alice"]), followersFile(["alice"], ["dave"])), T2);
    expect(result.summary.exportChanged).toBe(false);
    expect(result.dirty).toBe(false);
    expect(result.master.lastImportAt).toBe(T1);
    expect(result.master.accounts.dave?.followerChange).toBe(FOLLOWER_CHANGES.NEW);
    expect(result.summary.newFollowers).toBe(1);
  });

  test("a later export updates follows, marks new/lost followers and keeps review data", () => {
    const saved = freshMaster();
    must(saved.accounts.bob).review = { reviewed: true, lastReviewedAt: T1, unavailable: false, tags: ["artist"], notes: "hi" };
    const result = importExport(asFile(saved), bundle(followingFile(["alice"]), followersFile(["alice"], ["dave"])), T2);

    expect(result.summary).toMatchObject({ exportChanged: true, newFollowers: 1, lostFollowers: 1 });
    expect(result.master.accounts.dave?.followerChange).toBe(FOLLOWER_CHANGES.NEW);
    expect(result.master.accounts.carol?.followerChange).toBe(FOLLOWER_CHANGES.LOST);
    expect(result.master.accounts.alice?.followerChange).toBeUndefined();
    expect(relationshipOf(must(result.master.accounts.bob))).toBe(RELATIONSHIPS.NEITHER);
    expect(result.master.accounts.bob?.review.notes).toBe("hi");
    expect(result.master.accounts.alice?.username).toBe("alice"); // casing follows the newest export
    expect(result.master.lastImportAt).toBe(T2);
  });

  test("the next changed export replaces the markers", () => {
    const second = importExport(asFile(freshMaster()), bundle(followingFile(["alice"]), followersFile(["alice"], ["dave"])), T2).master;
    const third = importExport(asFile(second), bundle(followingFile(["alice"]), followersFile(["dave"], ["erin"])), T2).master;
    expect(Object.entries(third.accounts).filter(([, a]) => a.followerChange).map(([k, a]) => [k, a.followerChange]))
      .toEqual([["alice", FOLLOWER_CHANGES.LOST], ["erin", FOLLOWER_CHANGES.NEW]]);
  });

  test("rejects exports with an empty side", () => {
    expect(() => importExport(null, bundle(followingFile(), followersFile(["a"])), T1)).toThrow(ImportError);
    expect(() => importExport(null, bundle(followingFile(["a"])), T1)).toThrow(ImportError);
  });
});

describe("parsing", () => {
  test("following: username from title, missing timestamp → since null", () => {
    expect(parseFollowingJson({ relationships_following: [{ title: "x", string_list_data: [{ href: "https://www.instagram.com/_u/x" }] }, { title: "" }, null] }))
      .toEqual([{ username: "x", since: null }]);
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
    const alice = must(freshMaster().accounts.alice);
    alice.review.tags = ["untagged"];
    expect(tagMatches(alice, { kind: TAG_FILTER_KINDS.TAG, tag: "untagged" })).toBe(true);
    expect(tagMatches(alice, { kind: TAG_FILTER_KINDS.UNTAGGED })).toBe(false);
  });
});
