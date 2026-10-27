import type { AccountRecord, MasterFile } from "../core/index.ts";

/**
 * Per-tab safety net so a reload doesn't lose work. For each open tab it keeps the
 * imported master once (`base`, which is also the session baseline) plus a record for
 * every account changed since, so an edit writes ~1 KB however large the master is.
 * The downloaded master file stays the real record.
 */
export interface TabMeta {
  revision: number;
  savedRevision: number;
  /** The master's lastSavedAt, which changes on every save. */
  lastSavedAt?: string;
  /** When this tab's data was last written. */
  storedAt: string;
}

export interface StoredTab {
  base: unknown;
  meta: TabMeta;
  /** Account key → latest record, for accounts changed since import. */
  changed: Record<string, unknown>;
}

export interface TabStore {
  /** False for the in-memory fallback: work then does not survive a reload. */
  readonly durable: boolean;
  load(): Promise<StoredTab | null>;
  /** New import: drops everything stored for this tab and starts over from `base`. */
  replace(base: MasterFile, meta: TabMeta, changed: Record<string, AccountRecord>): Promise<void>;
  /** An edit: writes only the given accounts. */
  update(meta: TabMeta, changed: Record<string, AccountRecord>): Promise<void>;
}

/** Storage-wide operations used when tabs start up. */
export interface TabDatabase {
  forTab(tabId: string): TabStore;
  tabIds(): Promise<string[]>;
  copyTab(from: string, to: string): Promise<void>;
  deleteTab(tabId: string): Promise<void>;
}

const DB_NAME = "instagram-review";
const DB_VERSION = 2; // v1 held a single whole-session record
const TABS = "tabs"; // tabId → { base, meta }
const ACCOUNTS = "accounts"; // [tabId, accountKey] → AccountRecord

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => { resolve(req.result); };
    req.onerror = () => { reject(req.error ?? new Error("Browser storage request failed")); };
  });
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => { resolve(); };
    tx.onerror = () => { reject(tx.error ?? new Error("Browser storage write failed")); };
    tx.onabort = () => { reject(tx.error ?? new Error("Browser storage write was aborted")); };
  });
}


interface TabRow {
  base: unknown;
  meta: TabMeta;
}

export function openIndexedDbTabDatabase(factory: IDBFactory = indexedDB, keyRange: typeof IDBKeyRange = IDBKeyRange): TabDatabase {
  let dbPromise: Promise<IDBDatabase> | null = null;

  /** Every [tabId, accountKey] key of one tab. Arrays sort after strings, so [tabId, []] bounds them all. */
  function tabRange(tabId: string): IDBKeyRange {
    return keyRange.bound([tabId], [tabId, []]);
  }

  function db(): Promise<IDBDatabase> {
    dbPromise ??= new Promise((resolve, reject) => {
      const open = factory.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const database = open.result;
        for (const name of [...database.objectStoreNames]) database.deleteObjectStore(name);
        database.createObjectStore(TABS);
        database.createObjectStore(ACCOUNTS);
      };
      open.onsuccess = () => {
        // Let a newer version of the app upgrade the database instead of being blocked by this tab.
        open.result.onversionchange = () => { open.result.close(); };
        resolve(open.result);
      };
      open.onblocked = () => { reject(new Error("Browser storage is held by an older open tab of this app")); };
      open.onerror = () => { reject(open.error ?? new Error("Could not open browser storage")); };
    });
    return dbPromise;
  }

  function forTab(tabId: string): TabStore {
    return {
      durable: true,
      async load() {
        const tx = (await db()).transaction([TABS, ACCOUNTS], "readonly");
        const accounts = tx.objectStore(ACCOUNTS);
        const [row, keys, records] = await Promise.all([
          done(tx.objectStore(TABS).get(tabId)) as Promise<TabRow | undefined>,
          done(accounts.getAllKeys(tabRange(tabId))),
          done(accounts.getAll(tabRange(tabId))),
        ]);
        if (!row) return null;
        const changed: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
        keys.forEach((key, i) => { changed[(key as [string, string])[1]] = records[i]; });
        return { base: row.base, meta: row.meta, changed };
      },

      async replace(base, meta, changed) {
        const tx = (await db()).transaction([TABS, ACCOUNTS], "readwrite");
        const accounts = tx.objectStore(ACCOUNTS);
        accounts.delete(tabRange(tabId));
        tx.objectStore(TABS).put({ base, meta } satisfies TabRow, tabId);
        for (const [key, record] of Object.entries(changed)) accounts.put(record, [tabId, key]);
        await committed(tx);
      },

      async update(meta, changed) {
        const tx = (await db()).transaction([TABS, ACCOUNTS], "readwrite");
        const tabs = tx.objectStore(TABS);
        const row = await done(tabs.get(tabId)) as TabRow | undefined;
        if (!row) {
          tx.abort();
          throw new Error("Nothing stored for this tab yet");
        }
        tabs.put({ base: row.base, meta } satisfies TabRow, tabId);
        const accounts = tx.objectStore(ACCOUNTS);
        for (const [key, record] of Object.entries(changed)) accounts.put(record, [tabId, key]);
        await committed(tx);
      },
    };
  }

  return {
    forTab,

    async tabIds() {
      const tx = (await db()).transaction(TABS, "readonly");
      return (await done(tx.objectStore(TABS).getAllKeys())).map(String);
    },

    async copyTab(from, to) {
      const tx = (await db()).transaction([TABS, ACCOUNTS], "readwrite");
      const tabs = tx.objectStore(TABS);
      const accounts = tx.objectStore(ACCOUNTS);
      const [row, keys, records] = await Promise.all([
        done(tabs.get(from)) as Promise<TabRow | undefined>,
        done(accounts.getAllKeys(tabRange(from))),
        done(accounts.getAll(tabRange(from))),
      ]);
      if (row) {
        tabs.put(row, to);
        keys.forEach((key, i) => { accounts.put(records[i], [to, (key as [string, string])[1]]); });
      }
      await committed(tx);
    },

    async deleteTab(tabId) {
      const tx = (await db()).transaction([TABS, ACCOUNTS], "readwrite");
      tx.objectStore(TABS).delete(tabId);
      tx.objectStore(ACCOUNTS).delete(tabRange(tabId));
      await committed(tx);
    },
  };
}

/** In-memory version: tests, and browsers without IndexedDB (work then survives only while the tab is open). */
export function createMemoryTabDatabase(): TabDatabase {
  const tabs = new Map<string, { base: unknown; meta: TabMeta; changed: Map<string, unknown> }>();

  return {
    forTab(tabId) {
      return {
        durable: false,
        load() {
          const tab = tabs.get(tabId);
          if (!tab) return Promise.resolve(null);
          const changed = Object.create(null) as Record<string, unknown>;
          for (const [key, record] of tab.changed) changed[key] = structuredClone(record);
          return Promise.resolve({ base: structuredClone(tab.base), meta: structuredClone(tab.meta), changed });
        },
        replace(base, meta, changed) {
          tabs.set(tabId, { base: structuredClone(base), meta: structuredClone(meta), changed: new Map(Object.entries(structuredClone(changed))) });
          return Promise.resolve();
        },
        update(meta, changed) {
          const tab = tabs.get(tabId);
          if (!tab) return Promise.reject(new Error("Nothing stored for this tab yet"));
          tab.meta = structuredClone(meta);
          for (const [key, record] of Object.entries(changed)) tab.changed.set(key, structuredClone(record));
          return Promise.resolve();
        },
      };
    },
    tabIds: () => Promise.resolve([...tabs.keys()]),
    copyTab(from, to) {
      const tab = tabs.get(from);
      if (tab) tabs.set(to, { base: structuredClone(tab.base), meta: structuredClone(tab.meta), changed: new Map(tab.changed) });
      return Promise.resolve();
    },
    deleteTab(tabId) {
      tabs.delete(tabId);
      return Promise.resolve();
    },
  };
}
