import {
  ACTION_TYPES,
  DEFAULT_TAG_OPTIONS,
  FOLLOW_CHANGES,
  ImportError,
  MasterFormatError,
  PLAN_STATES,
  RELATIONSHIPS,
  REVIEW_SCOPES,
  REVIEW_STATUSES,
  TAG_FILTER_KINDS,
  actionIneligibility,
  buildSessionDiff,
  createReview,
  followChangeCounts,
  followChangeMatches,
  importExport,
  planOf,
  planStats,
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
const T3 = "2026-10-25T10:00:00.000Z";
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
    must(master.accounts.bob).toUnfollow = PLAN_STATES.DONE;
    must(master.accounts.bob).unfollowedMeSeenAt = T1;
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
      planStats(frozen);
      planOf(alice, UNFOLLOW);
      followChangeMatches(alice, FOLLOW_CHANGES.NEW_FOLLOWS, T1);
      followChangeCounts(frozen, null);
      actionIneligibility(alice, REMOVE_FOLLOWER);
      buildSessionDiff(frozen.accounts, frozen.accounts);
    }).not.toThrow();
  });
});

describe("master file", () => {
  /** A saved master file as it comes out of JSON.parse, with one reviewed account, a plan and a stopped follow. */
  function saved(): Record<string, unknown> & { accounts: Record<string, Record<string, unknown>> } {
    const master = freshMaster();
    must(master.accounts.bob).review = { reviewed: true, lastReviewedAt: T1, unavailable: false, tags: ["artist"], notes: "" };
    must(master.accounts.bob).toUnfollow = PLAN_STATES.PLANNED;
    must(master.accounts.carol).unfollowedSeenAt = T1;
    return asFile({ ...master, lastSavedAt: T2 }) as ReturnType<typeof saved>;
  }

  test("is compact: defaults and derivable fields are left out", () => {
    const file = saved();
    expect(file.accounts).toEqual({
      alice: { username: "Alice", followingSince: 1_700_000_000, followerSince: 1_700_000_000 },
      bob: {
        username: "bob", followingSince: 1_700_000_000,
        review: { reviewed: true, lastReviewedAt: T1, unavailable: false, tags: ["artist"], notes: "" },
        toUnfollow: PLAN_STATES.PLANNED,
      },
      carol: { username: "carol", followerSince: 1_700_000_000, unfollowedSeenAt: T1 },
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
    must(raw2.accounts.bob).toUnfollow = true;
    expect(() => parseMaster(raw2)).toThrow("accounts.bob.toUnfollow should be one of planned, done");

    const raw3 = saved();
    must(raw3.accounts.carol).unfollowedSeenAt = "last week";
    expect(() => parseMaster(raw3)).toThrow("accounts.carol.unfollowedSeenAt should be a date");

    const raw4 = saved();
    must(raw4.accounts.alice).followingSince = "yesterday";
    expect(() => parseMaster(raw4)).toThrow("accounts.alice.followingSince should be a number or null");

  });

  test("rejects an account field it doesn't know instead of silently dropping it", () => {
    const raw = saved();
    must(raw.accounts.bob).plans = ["unfollow"];
    expect(() => parseMaster(raw)).toThrow("Invalid master file: accounts.bob.plans is not a known field.");
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
  /** Instagram follow date (seconds) just after T1, i.e. after the master below was saved. */
  const AFTER_T1 = Date.parse(T1) / 1000 + 60;
  const savedAtT1 = (master: Master) => asFile({ ...master, lastSavedAt: T1 });
  const changes = (newFollows: number, unfollowed: number, newFollowers: number, lostFollowers: number) => ({
    [FOLLOW_CHANGES.NEW_FOLLOWS]: newFollows,
    [FOLLOW_CHANGES.UNFOLLOWED]: unfollowed,
    [FOLLOW_CHANGES.NEW_FOLLOWERS]: newFollowers,
    [FOLLOW_CHANGES.LOST_FOLLOWERS]: lostFollowers,
  });

  test("first-time user: new master, everyone counts as new, nothing stopped", () => {
    const result = importExport(null, bundle(followingFile(["Alice", 100], ["bob", 200]), followersFile(["alice", 300]), followersFile(["carol", 400])), T1);
    expect(result.isNewMaster).toBe(true);
    expect(result.dirty).toBe(true);
    expect(result.master.tagOptions).toEqual(DEFAULT_TAG_OPTIONS);
    expect(result.master.lastImportAt).toBe(T1);
    expect(must(result.master.accounts.alice).following).toEqual({ since: 100 });
    expect(must(result.master.accounts.alice).followedBy).toEqual({ since: 300 });
    expect(relationshipOf(must(result.master.accounts.carol))).toBe(RELATIONSHIPS.FOLLOWS_YOU_ONLY);
    expect(Object.values(result.master.accounts).some(a => a.unfollowedSeenAt ?? a.unfollowedMeSeenAt)).toBe(false);
    expect(result.summary).toMatchObject({ followingCount: 2, followersCount: 2, changes: changes(2, 0, 2, 0) });
  });

  test("re-importing the same export is not dirty and changes nothing", () => {
    const earlier = importExport(savedAtT1(freshMaster()), bundle(followingFile(["Alice"]), followersFile(["alice"], ["dave", AFTER_T1])), T2).master;
    const result = importExport(asFile(earlier), bundle(followingFile(["Alice"]), followersFile(["alice"], ["dave", AFTER_T1])), T3);
    expect(result.summary.exportChanged).toBe(false);
    expect(result.dirty).toBe(false);
    expect(result.master.lastImportAt).toBe(T2);
    expect(result.master.accounts).toEqual(earlier.accounts);
    expect(result.summary.changes).toEqual(changes(0, 1, 1, 1)); // bob unfollowed, dave new, carol lost (all since T1)
  });

  test("a later export dates stopped follows and keeps review data", () => {
    const saved = freshMaster();
    must(saved.accounts.bob).review = { reviewed: true, lastReviewedAt: T1, unavailable: false, tags: ["artist"], notes: "hi" };
    const result = importExport(savedAtT1(saved), bundle(followingFile(["alice"]), followersFile(["alice"], ["dave", AFTER_T1])), T2);

    expect(result.summary).toMatchObject({ exportChanged: true, changes: changes(0, 1, 1, 1) });
    expect(result.master.accounts.bob?.unfollowedSeenAt).toBe(T2);
    expect(result.master.accounts.carol?.unfollowedMeSeenAt).toBe(T2);
    expect(result.master.accounts.alice?.unfollowedSeenAt).toBeUndefined();
    expect(relationshipOf(must(result.master.accounts.bob))).toBe(RELATIONSHIPS.NEITHER);
    expect(result.master.accounts.bob?.review.notes).toBe("hi");
    expect(result.master.accounts.alice?.username).toBe("alice"); // casing follows the newest export
    expect(result.master.lastImportAt).toBe(T2);
  });

  test("changes count from the save of the imported master, however many imports happened since", () => {
    const second = importExport(savedAtT1(freshMaster()), bundle(followingFile(["alice"], ["bob"], ["erin", AFTER_T1]), followersFile(["alice"])), T2).master;
    const third = importExport(asFile(second), bundle(followingFile(["alice"], ["erin", AFTER_T1], ["finn", AFTER_T1]), followersFile(["alice"])), T3);
    expect(third.summary.changes).toEqual(changes(2, 1, 0, 1)); // erin + finn new, bob unfollowed, carol lost
    const since = (key: string) => followChangeMatches(must(third.master.accounts[key]), FOLLOW_CHANGES.NEW_FOLLOWS, T1);
    expect(since("alice")).toBe(false); // followed before the save
    expect(since("erin")).toBe(true);
  });

  test("a follow without a known date counts as new so it gets looked at", () => {
    const followingNoDate = { relationships_following: [{ title: "zoe", string_list_data: [] }] };
    const result = importExport(savedAtT1(freshMaster()), bundle(followingNoDate, followersFile(["alice"])), T2);
    expect(followChangeMatches(must(result.master.accounts.zoe), FOLLOW_CHANGES.NEW_FOLLOWS, T1)).toBe(true);
  });

  test("following again clears the unfollow date", () => {
    const second = importExport(savedAtT1(freshMaster()), bundle(followingFile(["alice"]), followersFile(["alice"])), T2).master;
    expect(second.accounts.bob?.unfollowedSeenAt).toBe(T2);
    const third = importExport(asFile(second), bundle(followingFile(["alice"], ["bob"]), followersFile(["alice"], ["carol"])), T3).master;
    expect(third.accounts.bob?.unfollowedSeenAt).toBeUndefined();
    expect(third.accounts.carol?.unfollowedMeSeenAt).toBeUndefined();
  });

  test("plans are settled against the export and make the import dirty", () => {
    const saved = freshMaster();
    must(saved.accounts.bob).toUnfollow = PLAN_STATES.DONE; // really unfollowed
    must(saved.accounts.alice).toUnfollow = PLAN_STATES.DONE; // marked done, but still followed
    must(saved.accounts.carol).toRemove = PLAN_STATES.PLANNED; // not done yet
    const same = bundle(followingFile(["Alice"]), followersFile(["alice"], ["carol"]));
    const result = importExport(savedAtT1(saved), same, T2);
    expect(result.summary.plans).toEqual({
      completed: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 },
      reopened: { [UNFOLLOW]: 1, [REMOVE_FOLLOWER]: 0 },
    });
    expect(result.master.accounts.bob?.toUnfollow).toBeUndefined();
    expect(result.master.accounts.alice?.toUnfollow).toBe(PLAN_STATES.PLANNED);
    expect(result.master.accounts.carol?.toRemove).toBe(PLAN_STATES.PLANNED);
    expect(result.dirty).toBe(true);
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
