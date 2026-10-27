import { IDBFactory } from "fake-indexeddb";
import { strToU8, zipSync } from "fflate";
import { ImportError, emptyMaster, parseMaster, profileUrl, createReview, computeCurrent } from "../../core/index.ts";
import { followersFile, followingFile, must } from "../../core/__tests__/helpers.ts";
import { analyzeImport } from "../analyzeImport.ts";
import { masterFileName } from "../download.ts";
import { readInputs } from "../readInputs.ts";
import { createIndexedDbSessionStore, type StoredSession } from "../sessionStore.ts";

const following = JSON.stringify(followingFile(["alice"], ["bob"]));
const followers1 = JSON.stringify(followersFile(["alice"]));
const followers2 = JSON.stringify(followersFile(["carol"]));
const followers10 = JSON.stringify(followersFile(["zed"]));
const DIR = "instagram-me-2026/connections/followers_and_following";

describe("readInputs", () => {
  test("expands an Instagram zip, skipping media and macOS metadata without decompressing them", async () => {
    const zip = zipSync({
      [`${DIR}/following.json`]: strToU8(following),
      [`${DIR}/followers_1.json`]: strToU8(followers1),
      "instagram-me-2026/media/posts/photo.jpg": new Uint8Array([1, 2, 3]),
      "__MACOSX/._following.json": strToU8("junk"),
      "instagram-me-2026/start_here.html": strToU8("<html></html>"),
    });
    const inputs = await readInputs([new File([zip], "instagram-me-2026.zip")]);
    expect(inputs.map(i => i.path).sort()).toEqual([
      `instagram-me-2026.zip/${DIR}/followers_1.json`,
      `instagram-me-2026.zip/${DIR}/following.json`,
      "instagram-me-2026.zip/instagram-me-2026/start_here.html",
    ]);
    expect(inputs.find(i => i.path.endsWith("following.json"))?.text).toBe(following);
  });

  test("reads loose JSON files and ignores unrelated file types", async () => {
    const inputs = await readInputs([
      new File([following], "following.json"),
      new File(["x"], "notes.txt"),
      new File([new Uint8Array([0xff])], "photo.jpg"),
    ]);
    expect(inputs).toEqual([{ path: "following.json", text: following }]);
  });

  test("decodes UTF-8 usernames and notes correctly", async () => {
    const text = JSON.stringify({ accounts: { "ünïcode": { notes: "кириллица 🎨" } } });
    const [input] = await readInputs([new File([text], "master.json")]);
    expect(input?.text).toBe(text);
  });
});

describe("analyzeImport", () => {
  const f = (path: string, text: string) => ({ path, text });

  test("finds following, follower chunks in numeric order, and the master", () => {
    const master = { accounts: {}, last_saved_at: "2026-10-01T00:00:00Z" };
    const result = analyzeImport([
      f(`${DIR}/followers_10.json`, followers10),
      f(`${DIR}/followers_2.json`, followers2),
      f(`${DIR}/followers_1.json`, followers1),
      f(`${DIR}/following.json`, following),
      f("instagram_master_tracker_2026-10-01.json", JSON.stringify(master)),
      f("x/liked_posts.json", "[]"),
      f("x/close_friends.json", JSON.stringify({ relationships_close_friends: [] })),
      f("x/broken.json", "{not json"),
    ], null);

    expect(result.bundle.sourceFiles).toEqual([`${DIR}/following.json`, `${DIR}/followers_1.json`, `${DIR}/followers_2.json`, `${DIR}/followers_10.json`]);
    expect(result.bundle.followers.map(a => a.username)).toEqual(["alice", "carol", "zed"]);
    expect(result.bundle.following).toHaveLength(2);
    expect(result.bundle.followerFileCount).toBe(3);
    expect(result.rawMaster).toEqual(master);
    expect(result.ignoredCount).toBe(3);
    expect(result.warnings).toEqual([]);
  });

  test("no master is fine for a first-time user", () => {
    const result = analyzeImport([f("following.json", following), f("followers_1.json", followers1)], null);
    expect(result.rawMaster).toBeNull();
    expect(result.warnings).toEqual([]);
  });

  test.each([
    ["HTML export", [f("connections/following.html", "<html>"), f("connections/followers_1.html", "<html>")], /HTML format/],
    ["nothing relevant", [f("liked_posts.json", "[]")], /No Instagram followers\/following files/],
    ["missing following", [f("followers_1.json", followers1)], /following\.json\) is missing/],
    ["missing followers", [f("following.json", following)], /followers_1\.json, …\) are missing/],
    ["two exports", [f("a/following.json", following), f("b/following.json", following), f("followers_1.json", followers1)], /more than one Following file/],
    ["same chunk twice", [f("following.json", following), f("a/followers_1.json", followers1), f("b/followers_1.json", followers1)], /followers_1\.json twice/],
    ["two masters", [f("following.json", following), f("followers_1.json", followers1), f("m1.json", '{"accounts":{}}'), f("m2.json", '{"accounts":{}}')], /2 master files/],
  ])("rejects: %s", (_, inputs, message) => {
    expect(() => analyzeImport(inputs, null)).toThrow(ImportError);
    expect(() => analyzeImport(inputs, null)).toThrow(message);
  });

  test("warns when the chosen master is older than the last save from this browser", () => {
    const base = [f("following.json", following), f("followers_1.json", followers1)];
    const old = analyzeImport([...base, f("m.json", JSON.stringify({ accounts: {}, last_saved_at: "2026-10-01T00:00:00Z" }))], "2026-10-20T00:00:00Z");
    expect(old.warnings).toEqual([{ kind: "master_older_than_last_save", fileSavedAt: "2026-10-01T00:00:00Z", lastKnownSavedAt: "2026-10-20T00:00:00Z" }]);

    const neverSaved = analyzeImport([...base, f("m.json", '{"accounts":{}}')], "2026-10-20T00:00:00Z");
    expect(neverSaved.warnings[0]?.kind).toBe("master_older_than_last_save");

    const current = analyzeImport([...base, f("m.json", JSON.stringify({ accounts: {}, last_saved_at: "2026-10-20T00:00:00Z" }))], "2026-10-20T00:00:00Z");
    expect(current.warnings).toEqual([]);

    expect(analyzeImport(base, "2026-10-20T00:00:00Z").warnings).toEqual([{ kind: "no_master_but_saved_before", lastKnownSavedAt: "2026-10-20T00:00:00Z" }]);
  });
});

describe("IndexedDB session store", () => {
  test("round-trips a frozen, prototype-free master and the last-saved time", async () => {
    const store = createIndexedDbSessionStore(new IDBFactory());
    expect(await store.loadSession()).toBeNull();
    expect(await store.getLastSavedAt()).toBeNull();

    const master = emptyMaster();
    const constructorKey: string = "constructor";
    master.accounts[constructorKey] = { username: "constructor", url: profileUrl("constructor"), review: createReview(), current: computeCurrent(null, null) };
    const session: StoredSession = {
      master: Object.freeze(master), baseline: master, revision: 3, savedRevision: 1, pendingSnapshot: true, message: "m", storedAt: "2026-10-27T12:00:00Z",
    };
    await store.saveSession(session);
    await store.setLastSavedAt("2026-10-27T12:00:00Z");

    const loaded = must(await store.loadSession());
    expect(loaded.revision).toBe(3);
    // IndexedDB returns plain objects; parseMaster rebuilds the prototype-free dictionary.
    const revived = parseMaster(loaded.master);
    const key: string = "constructor";
    expect(revived.accounts[key]?.username).toBe("constructor");
    expect(await store.getLastSavedAt()).toBe("2026-10-27T12:00:00Z");

    await store.clearSession();
    expect(await store.loadSession()).toBeNull();
  });

  test("ignores a stored value that is not a session", async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbSessionStore(factory);
    await store.setLastSavedAt("x"); // creates the database
    const db = await new Promise<IDBDatabase>(resolve => { const r = factory.open("instagram-review", 1); r.onsuccess = () => { resolve(r.result); }; });
    await new Promise(resolve => { const r = db.transaction("kv", "readwrite").objectStore("kv").put({ junk: true }, "session"); r.onsuccess = resolve; });
    expect(await store.loadSession()).toBeNull();
  });
});

test("master file names are timestamped in local time", () => {
  expect(masterFileName(new Date(2026, 9, 7, 4, 5, 9))).toBe("instagram_master_tracker_2026-10-07_04-05-09.json");
});
