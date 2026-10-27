import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { strToU8, zipSync } from "fflate";
import { ImportError, type MasterFile } from "../../core/index.ts";
import { followersFile, followingFile, must } from "../../core/__tests__/helpers.ts";
import { analyzeImport } from "../analyzeImport.ts";
import { masterFileName } from "../download.ts";
import { readInputs } from "../readInputs.ts";
import { localStorageLastSaved } from "../lastSaved.ts";
import { claimTab, type TabEnvironment } from "../tabIdentity.ts";
import { createMemoryTabDatabase, openIndexedDbTabDatabase, type TabMeta } from "../tabStore.ts";

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

const META: TabMeta = { revision: 2, savedRevision: 0, pendingSnapshot: true, message: "m", tag_options: ["artist"], storedAt: "2026-10-27T12:00:00Z" };
const BASE: MasterFile = {
  version: 1,
  tag_options: ["artist"],
  snapshot: { captured_at: "2026-10-27T12:00:00Z" },
  accounts: JSON.parse('{"bob":{"username":"bob"},"constructor":{"username":"constructor"}}') as MasterFile["accounts"],
};

describe.each([
  ["IndexedDB", () => openIndexedDbTabDatabase(new IDBFactory(), IDBKeyRange)],
  ["memory", () => createMemoryTabDatabase()],
])("%s tab store", (_, open) => {
  test("stores the base once and changed accounts on top; tabs are isolated", async () => {
    const db = open();
    const tab = db.forTab("a");
    expect(await tab.load()).toBeNull();

    await tab.replace(BASE, META, {});
    await tab.update({ ...META, revision: 3 }, { bob: { username: "bob", review: { reviewed: true, last_reviewed_at: "t", deleted_or_unavailable: false, tags: [], notes: "" } } });
    await tab.update({ ...META, revision: 4 }, { constructor: { username: "constructor", follower_since: 5 } });

    const loaded = must(await tab.load());
    expect(loaded.base).toEqual(BASE);
    expect(loaded.meta.revision).toBe(4);
    expect(Object.keys(loaded.changed).sort()).toEqual(["bob", "constructor"]);
    const key: string = "constructor";
    expect(loaded.changed[key]).toEqual({ username: "constructor", follower_since: 5 });

    expect(await db.forTab("b").load()).toBeNull();
    expect(await db.tabIds()).toEqual(["a"]);
  });

  test("replace drops the tab's earlier changes", async () => {
    const tab = open().forTab("a");
    await tab.replace(BASE, META, {});
    await tab.update(META, { bob: { username: "bob" } });
    await tab.replace(BASE, META, {});
    expect(must(await tab.load()).changed).toEqual({});
  });

  test("an update with nothing stored yet fails instead of writing a partial tab", async () => {
    await expect(open().forTab("a").update(META, {})).rejects.toThrow();
  });

  test("copy and delete work per tab", async () => {
    const db = open();
    await db.forTab("a").replace(BASE, META, {});
    await db.forTab("a").update(META, { bob: { username: "bob" } });
    await db.copyTab("a", "b");
    await db.deleteTab("a");
    expect(await db.tabIds()).toEqual(["b"]);
    expect(Object.keys(must(await db.forTab("b").load()).changed)).toEqual(["bob"]);
  });
});

/** Simulated browser: sessionStorage per tab, Web Locks shared by all tabs. */
function fakeBrowser() {
  const held = new Set<string>();
  const locks = {
    request: ((name: string, _options: { ifAvailable: boolean }, callback: (lock: { name: string } | null) => unknown) => {
      if (held.has(name)) return Promise.resolve(callback(null));
      held.add(name);
      return Promise.resolve(callback({ name }));
    }) as unknown as LockManager["request"],
    query: () => Promise.resolve({ held: [...held].map(name => ({ name })), pending: [] }),
  };
  let counter = 0;
  const tab = (session = new Map<string, string>()): TabEnvironment & { session: Map<string, string> & Pick<Storage, "getItem" | "setItem"> } => {
    const storage = Object.assign(session, {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => { session.set(key, value); },
    });
    return { session: storage, locks, newId: () => `id-${++counter}` };
  };
  return { tab, close: (id: string) => { held.delete(`instagram-review:tab:${id}`); } };
}

describe("tab identity", () => {
  test("reload keeps the tab's id (and data); closing the tab lets the next start clean it up", async () => {
    const db = createMemoryTabDatabase();
    const browser = fakeBrowser();
    const env = browser.tab();

    const id = await claimTab(db, env);
    await db.forTab(id).replace(BASE, META, {});

    browser.close(id); // reload: the old page releases its lock…
    expect(await claimTab(db, env)).toBe(id); // …and the new page gets the same id back
    expect(await db.forTab(id).load()).not.toBeNull();

    browser.close(id); // the tab is closed for good (its sessionStorage is gone)
    const other = await claimTab(db, browser.tab());
    expect(other).not.toBe(id);
    expect(await db.tabIds()).toEqual([]); // the closed tab's data was removed
  });

  test("a duplicated tab gets its own id and a copy of the data; the original is untouched", async () => {
    const db = createMemoryTabDatabase();
    const browser = fakeBrowser();
    const original = browser.tab();
    const id = await claimTab(db, original);
    await db.forTab(id).replace(BASE, META, {});

    const duplicate = browser.tab(new Map(original.session)); // "Duplicate tab" copies sessionStorage
    const copyId = await claimTab(db, duplicate);
    expect(copyId).not.toBe(id);
    expect(must(await db.forTab(copyId).load()).base).toEqual(BASE);
    expect((await db.tabIds()).sort()).toEqual([id, copyId].sort());
  });

  test("without Web Locks it still works, it just can't clean up", async () => {
    const db = createMemoryTabDatabase();
    await db.forTab("old").replace(BASE, META, {});
    const env = { ...fakeBrowser().tab(), locks: null };
    const id = await claimTab(db, env);
    expect(await claimTab(db, env)).toBe(id);
    expect((await db.tabIds()).sort()).toEqual(["old"]);
  });
});

test("last-saved time survives in localStorage and tolerates blocked storage", () => {
  const store = localStorageLastSaved(window.localStorage);
  store.set("2026-10-27T12:00:00Z");
  expect(localStorageLastSaved(window.localStorage).get()).toBe("2026-10-27T12:00:00Z");
  const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  expect(localStorageLastSaved(blocked).get()).toBeNull();
  expect(() => { localStorageLastSaved(blocked).set("x"); }).not.toThrow();
});

test("master file names are timestamped in local time", () => {
  expect(masterFileName(new Date(2026, 9, 7, 4, 5, 9))).toBe("instagram_master_tracker_2026-10-07_04-05-09.json");
});
