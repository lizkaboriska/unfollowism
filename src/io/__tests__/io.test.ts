import { IDBDatabase, IDBFactory, IDBKeyRange } from "fake-indexeddb";
import { TextReader, Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from "@zip.js/zip.js";
import { IMPORT_PROBLEMS, type MasterFile } from "../../core/index.ts";
import { followersFile, followingFile, must, problemOf } from "../../core/__tests__/helpers.ts";
import { IMPORT_WARNINGS, analyzeImport } from "../analyzeImport.ts";
import { masterFileName } from "../download.ts";
import { readInputs } from "../readInputs.ts";
import { localStorageLastSaved } from "../lastSaved.ts";
import { claimTab, type TabEnvironment } from "../tabIdentity.ts";
import { createMemoryTabDatabase, openIndexedDbTabDatabase, type TabMeta, type TabWrites } from "../tabStore.ts";

const following = JSON.stringify(followingFile(["alice"], ["bob"]));
const followers1 = JSON.stringify(followersFile(["alice"]));
const followers2 = JSON.stringify(followersFile(["carol"]));
const followers10 = JSON.stringify(followersFile(["zed"]));
const DIR = "instagram-me-2026/connections/followers_and_following";

/** Bytes rather than a Blob: zip.js builds Blobs with Node's Response, and jsdom's File doesn't accept those. */
async function zipOf(entries: Record<string, string | Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  for (const [name, content] of Object.entries(entries)) {
    await writer.add(name, typeof content === "string" ? new TextReader(content) : new Uint8ArrayReader(content));
  }
  return writer.close();
}

describe("readInputs", () => {
  test("expands an Instagram zip: JSON is read, HTML only by name, media and macOS metadata skipped", async () => {
    const zip = await zipOf({
      [`${DIR}/following.json`]: following,
      [`${DIR}/followers_1.json`]: followers1,
      "instagram-me-2026/media/posts/photo.jpg": new Uint8Array([1, 2, 3]),
      "__MACOSX/._following.json": "junk",
      "instagram-me-2026/start_here.html": "<html></html>",
    });
    const inputs = await readInputs([new File([zip], "instagram-me-2026.zip")]);
    expect(inputs.map(i => i.path).sort()).toEqual([
      `instagram-me-2026.zip/${DIR}/followers_1.json`,
      `instagram-me-2026.zip/${DIR}/following.json`,
      "instagram-me-2026.zip/instagram-me-2026/start_here.html",
    ]);
    expect(inputs.find(i => i.path.endsWith("following.json"))?.text).toBe(following);
    expect(inputs.find(i => i.path.endsWith(".html"))?.text).toBe("");
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
  const prepare = (inputs: { path: string; text: string }[], lastKnownSavedAt: string | null = null) =>
    must(analyzeImport(inputs, lastKnownSavedAt).prepared);

  test("finds following, follower chunks in numeric order, and the master", () => {
    const master = { accounts: {}, lastSavedAt: "2026-10-01T00:00:00Z" };
    const { recognized, prepared } = analyzeImport([
      f(`${DIR}/followers_10.json`, followers10),
      f(`${DIR}/followers_2.json`, followers2),
      f(`${DIR}/followers_1.json`, followers1),
      f(`${DIR}/following.json`, following),
      f("saved/instagram_master_tracker_2026-10-01.json", JSON.stringify(master)),
      f("x/liked_posts.json", "[]"),
      f("x/close_friends.json", JSON.stringify({ relationships_close_friends: [] })),
      f("x/broken.json", "{not json"),
    ], null);

    expect(recognized).toEqual({
      hasFollowing: true,
      followerFileCount: 3,
      master: { name: "instagram_master_tracker_2026-10-01.json", savedAt: "2026-10-01T00:00:00Z" },
    });
    const result = must(prepared);
    expect(result.bundle.followers.map(a => a.username)).toEqual(["alice", "carol", "zed"]);
    expect(result.bundle.following).toHaveLength(2);
    expect(result.bundle.followerFileCount).toBe(3);
    expect(result.rawMaster).toEqual(master);
    expect(result.warnings).toEqual([]);
  });

  test("no master is fine for a first-time user", () => {
    const { recognized, prepared } = analyzeImport([f("following.json", following), f("followers_1.json", followers1)], null);
    expect(recognized.master).toBeNull();
    expect(must(prepared).rawMaster).toBeNull();
    expect(must(prepared).warnings).toEqual([]);
  });

  test.each([
    ["nothing relevant", [f("liked_posts.json", "[]")], { hasFollowing: false, followerFileCount: 0, master: null }],
    ["missing following", [f("followers_1.json", followers1)], { hasFollowing: false, followerFileCount: 1, master: null }],
    ["missing followers", [f("following.json", following), f("m.json", '{"accounts":{}}')], { hasFollowing: true, followerFileCount: 0, master: { name: "m.json", savedAt: null } }],
  ])("incomplete selection is reported, not rejected: %s", (_, inputs, recognized) => {
    expect(analyzeImport(inputs, null)).toEqual({ recognized, prepared: null });
  });

  test.each([
    ["HTML export", [f("connections/following.html", "<html>"), f("connections/followers_1.html", "<html>")],
      { kind: IMPORT_PROBLEMS.HTML_EXPORT }],
    ["two exports", [f("a/following.json", following), f("b/following.json", following), f("followers_1.json", followers1)],
      { kind: IMPORT_PROBLEMS.SEVERAL_FOLLOWING_FILES, paths: ["a/following.json", "b/following.json"] }],
    ["same chunk twice", [f("following.json", following), f("a/followers_1.json", followers1), f("b/followers_1.json", followers1)],
      { kind: IMPORT_PROBLEMS.DUPLICATE_FOLLOWER_FILE, name: "followers_1.json" }],
    ["two masters", [f("following.json", following), f("followers_1.json", followers1), f("m1.json", '{"accounts":{}}'), f("m2.json", '{"accounts":{}}')],
      { kind: IMPORT_PROBLEMS.SEVERAL_MASTERS, names: ["m1.json", "m2.json"] }],
  ])("rejects: %s", (_, inputs, problem) => {
    expect(problemOf(() => analyzeImport(inputs, null))).toEqual(problem);
  });

  test("warns when the chosen master is older than the last save from this browser", () => {
    const base = [f("following.json", following), f("followers_1.json", followers1)];
    const old = prepare([...base, f("m.json", JSON.stringify({ accounts: {}, lastSavedAt: "2026-10-01T00:00:00Z" }))], "2026-10-20T00:00:00Z");
    expect(old.warnings).toEqual([{ kind: IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE, fileSavedAt: "2026-10-01T00:00:00Z", lastKnownSavedAt: "2026-10-20T00:00:00Z" }]);

    const neverSaved = prepare([...base, f("m.json", '{"accounts":{}}')], "2026-10-20T00:00:00Z");
    expect(neverSaved.warnings[0]?.kind).toBe(IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE);

    const current = prepare([...base, f("m.json", JSON.stringify({ accounts: {}, lastSavedAt: "2026-10-20T00:00:00Z" }))], "2026-10-20T00:00:00Z");
    expect(current.warnings).toEqual([]);

    expect(prepare(base, "2026-10-20T00:00:00Z").warnings).toEqual([{ kind: IMPORT_WARNINGS.NO_MASTER_BUT_SAVED_BEFORE, lastKnownSavedAt: "2026-10-20T00:00:00Z" }]);
  });
});

const META: TabMeta = { revision: 2, savedRevision: 0, storedAt: "2026-10-27T12:00:00Z" };
const NOTHING: TabWrites = { changed: {}, saved: {} };
const edited = (changed: TabWrites["changed"]) => ({ changed, removed: [], saved: {} });
const BASE: MasterFile = {
  version: 1,
  lastImportAt: "2026-10-27T12:00:00Z",
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

    await tab.replace(BASE, META, NOTHING);
    await tab.update({ ...META, revision: 3 }, edited({ bob: { username: "bob", review: { reviewed: true, unavailable: false, tags: [], notes: "" } } }));
    await tab.update({ ...META, revision: 4 }, edited({ constructor: { username: "constructor", followerSince: 5 } }));

    const loaded = must(await tab.load());
    expect(loaded.base).toEqual(BASE);
    expect(loaded.meta.revision).toBe(4);
    expect(Object.keys(loaded.changed).sort()).toEqual(["bob", "constructor"]);
    const key: string = "constructor";
    expect(loaded.changed[key]).toEqual({ username: "constructor", followerSince: 5 });
    expect(loaded.saved).toEqual({});

    expect(await db.forTab("b").load()).toBeNull();
    expect(await db.tabIds()).toEqual(["a"]);
  });

  test("a removed account (null record) is kept and read back as null", async () => {
    const tab = open().forTab("a");
    await tab.replace(BASE, META, { changed: { bob: null }, saved: {} });
    await tab.update(META, { changed: {}, removed: [], saved: { bob: null } });
    const loaded = must(await tab.load());
    expect(Object.keys(loaded.changed)).toEqual(["bob"]);
    expect(loaded.changed.bob).toBeNull();
    expect(loaded.saved.bob).toBeNull();
  });

  test("an account keyed __proto__ comes back as an ordinary account", async () => {
    const tab = open().forTab("a");
    const records = JSON.parse('{"__proto__":{"username":"__proto__"}}') as TabWrites["changed"]; // a literal would set the prototype
    await tab.replace(BASE, META, { changed: records, saved: records });
    const loaded = must(await tab.load());
    expect(Object.keys(loaded.changed)).toEqual(["__proto__"]);
    expect(Object.keys(loaded.saved)).toEqual(["__proto__"]);
    expect(Object.getOwnPropertyDescriptor(loaded.changed, "__proto__")?.value).toEqual({ username: "__proto__" });
  });

  test("replace drops the tab's earlier changes", async () => {
    const tab = open().forTab("a");
    await tab.replace(BASE, META, NOTHING);
    await tab.update(META, { changed: { bob: { username: "bob" } }, removed: [], saved: { bob: { username: "bob" } } });
    await tab.replace(BASE, META, NOTHING);
    const loaded = must(await tab.load());
    expect(loaded.changed).toEqual({});
    expect(loaded.saved).toEqual({});
  });

  test("keeps saved versions next to changed ones; a reset removes accounts that are no longer changed", async () => {
    const tab = open().forTab("a");
    await tab.replace(BASE, META, NOTHING);
    await tab.update(META, edited({ bob: { username: "bob", followerSince: 1 } }));
    await tab.update(META, { changed: {}, removed: [], saved: { bob: { username: "bob", followerSince: 1 } } }); // save
    await tab.update(META, edited({ bob: { username: "bob", followerSince: 2 }, constructor: { username: "constructor" } }));
    await tab.update(META, { changed: { bob: { username: "bob", followerSince: 1 } }, removed: ["constructor"], saved: {} }); // reset

    const loaded = must(await tab.load());
    expect(loaded.changed).toEqual({ bob: { username: "bob", followerSince: 1 } });
    expect(loaded.saved).toEqual({ bob: { username: "bob", followerSince: 1 } });
  });

  test("an update with nothing stored yet fails instead of writing a partial tab", async () => {
    await expect(open().forTab("a").update(META, edited({}))).rejects.toThrow();
  });

  test("copy and delete work per tab", async () => {
    const db = open();
    await db.forTab("a").replace(BASE, META, NOTHING);
    await db.forTab("a").update(META, { changed: { bob: { username: "bob" } }, removed: [], saved: { alice: { username: "alice" } } });
    await db.copyTab("a", "b");
    await db.deleteTab("a");
    expect(await db.tabIds()).toEqual(["b"]);
    const copy = must(await db.forTab("b").load());
    expect(Object.keys(copy.changed)).toEqual(["bob"]);
    expect(Object.keys(copy.saved)).toEqual(["alice"]);
    expect(await db.forTab("a").load()).toBeNull();
  });
});

describe("IndexedDB tab store", () => {
  afterEach(() => { vi.restoreAllMocks(); });

  test("an edit writes the meta and accounts, never the stored master", async () => {
    const tab = openIndexedDbTabDatabase(new IDBFactory(), IDBKeyRange).forTab("a");
    await tab.replace(BASE, META, NOTHING);
    const transaction = vi.spyOn(IDBDatabase.prototype, "transaction");
    await tab.update({ ...META, revision: 3 }, edited({ bob: { username: "bob" } }));
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[0]).not.toContain("tabs");
  });

  test("a v3 database (meta kept with the master) is migrated, keeping the stored work", async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const open = factory.open("instagram-review", 3);
      open.onupgradeneeded = () => {
        const database = open.result;
        database.createObjectStore("tabs").put({ base: BASE, meta: META }, "a");
        database.createObjectStore("accounts").put({ username: "bob" }, ["a", "bob"]);
        database.createObjectStore("savedAccounts").put({ username: "bob", followerSince: 1 }, ["a", "bob"]);
      };
      open.onsuccess = () => { open.result.close(); resolve(); };
      open.onerror = () => { reject(open.error ?? new Error("open failed")); };
    });

    const tab = openIndexedDbTabDatabase(factory, IDBKeyRange).forTab("a");
    expect(await tab.load()).toEqual({ base: BASE, meta: META, changed: { bob: { username: "bob" } }, saved: { bob: { username: "bob", followerSince: 1 } } });
    await tab.update({ ...META, revision: 3 }, edited({}));
    expect(must(await tab.load()).meta.revision).toBe(3);
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
    await db.forTab(id).replace(BASE, META, NOTHING);

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
    await db.forTab(id).replace(BASE, META, NOTHING);

    const duplicate = browser.tab(new Map(original.session)); // "Duplicate tab" copies sessionStorage
    const copyId = await claimTab(db, duplicate);
    expect(copyId).not.toBe(id);
    expect(must(await db.forTab(copyId).load()).base).toEqual(BASE);
    expect((await db.tabIds()).sort()).toEqual([id, copyId].sort());
  });

  test("without Web Locks it still works, it just can't clean up", async () => {
    const db = createMemoryTabDatabase();
    await db.forTab("old").replace(BASE, META, NOTHING);
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
