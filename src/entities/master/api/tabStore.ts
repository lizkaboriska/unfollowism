import type { AccountRecord, MasterFile } from '../lib/masterFile.ts';
import type { ImportFacts } from '../lib/types.ts';

/**
 * Per-tab safety net so a reload doesn't lose work. For each open tab it keeps the
 * imported master once (`base`, which is also the session baseline) plus a record for
 * every account changed since, so an edit writes ~1 KB however large the master is.
 * It also keeps the changed accounts as they were in the last downloaded file, so
 * Reset changes still works after a reload. The downloaded master file stays the real record.
 */
export interface TabMeta {
  revision: number;
  savedRevision: number;
  /** The master's lastSavedAt, which changes on every save. */
  lastSavedAt?: string;
  /** When this tab's data was last written. */
  storedAt: string;
  /** What the import found besides the master (see ImportFacts). */
  importFacts: ImportFacts;
}

export interface StoredTab {
  base: unknown;
  meta: TabMeta;
  /** Account key → latest record (null = removed), for accounts changed since import. */
  changed: Record<string, unknown>;
  /** Account key → record as in the last downloaded file, for accounts changed between import and that save. */
  saved: Record<string, unknown>;
}

/**
 * Account records to write: changed accounts, and accounts as they were in the last downloaded file. null = removed
 * since the import.
 */
export interface TabWrites {
  changed: Record<string, AccountRecord | null>;
  saved: Record<string, AccountRecord | null>;
}

export interface TabStore {
  /** False for the in-memory fallback: work then does not survive a reload. */
  readonly durable: boolean;
  load(): Promise<StoredTab | null>;
  /** New import: drops everything stored for this tab and starts over from `base`. */
  replace(base: MasterFile, meta: TabMeta, writes: TabWrites): Promise<void>;
  /** An edit, save or reset: writes only the given accounts; `removed` are no longer changed (after a reset). */
  update(meta: TabMeta, writes: TabWrites & { removed: string[] }): Promise<void>;
}

/** Storage-wide operations used when tabs start up. */
export interface TabDatabase {
  forTab(tabId: string): TabStore;
  tabIds(): Promise<string[]>;
  copyTab(from: string, to: string): Promise<void>;
  deleteTab(tabId: string): Promise<void>;
}

const DB_NAME = 'unfollowism';
// Bump on any change of the stored shape: older data is dropped, not migrated.
const DB_VERSION = 6;
const TABS = 'tabs'; // tabId → base
const META = 'meta'; // tabId → TabMeta. Rewritten on every edit, so kept apart from the (large) base.
const ACCOUNTS = 'accounts'; // [tabId, accountKey] → AccountRecord
const SAVED_ACCOUNTS = 'savedAccounts'; // [tabId, accountKey] → AccountRecord
const ACCOUNT_STORES = [ACCOUNTS, SAVED_ACCOUNTS] as const;

function done<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('Browser storage request failed'));
    };
  });
}

function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => {
      resolve();
    };
    tx.onerror = () => {
      reject(tx.error ?? new Error('Browser storage write failed'));
    };
    tx.onabort = () => {
      reject(tx.error ?? new Error('Browser storage write was aborted'));
    };
  });
}

export function openIndexedDbTabDatabase(
  factory: IDBFactory = indexedDB,
  keyRange: typeof IDBKeyRange = IDBKeyRange,
): TabDatabase {
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
        for (const name of [...database.objectStoreNames]) {
          database.deleteObjectStore(name);
        }
        for (const name of [TABS, META, ...ACCOUNT_STORES]) {
          database.createObjectStore(name);
        }
      };
      open.onsuccess = () => {
        // Let a newer version of the app upgrade the database instead of being blocked by this tab.
        open.result.onversionchange = () => {
          open.result.close();
        };
        resolve(open.result);
      };
      open.onblocked = () => {
        reject(new Error('Browser storage is held by an older open tab of this app'));
      };
      open.onerror = () => {
        reject(open.error ?? new Error('Could not open browser storage'));
      };
    });
    return dbPromise;
  }

  /** Account key → record, for one tab in one account store. */
  async function loadAccounts(store: IDBObjectStore, tabId: string): Promise<Record<string, unknown>> {
    const [keys, records] = await Promise.all([
      done(store.getAllKeys(tabRange(tabId))),
      done(store.getAll(tabRange(tabId))),
    ]);
    const accounts: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    keys.forEach((key, i) => {
      accounts[(key as [string, string])[1]] = records[i];
    });
    return accounts;
  }

  function putAccounts(store: IDBObjectStore, tabId: string, records: Record<string, unknown>): void {
    for (const [key, record] of Object.entries(records)) {
      store.put(record, [tabId, key]);
    }
  }

  function forTab(tabId: string): TabStore {
    return {
      durable: true,
      async load() {
        const tx = (await db()).transaction([TABS, META, ...ACCOUNT_STORES], 'readonly');
        const [base, meta, changed, saved] = await Promise.all([
          done(tx.objectStore(TABS).get(tabId)) as Promise<unknown>,
          done(tx.objectStore(META).get(tabId)) as Promise<TabMeta | undefined>,
          loadAccounts(tx.objectStore(ACCOUNTS), tabId),
          loadAccounts(tx.objectStore(SAVED_ACCOUNTS), tabId),
        ]);
        if (base === undefined || !meta) {
          return null;
        }
        return { base, meta, changed, saved };
      },

      async replace(base, meta, writes) {
        const tx = (await db()).transaction([TABS, META, ...ACCOUNT_STORES], 'readwrite');
        for (const name of ACCOUNT_STORES) {
          tx.objectStore(name).delete(tabRange(tabId));
        }
        tx.objectStore(TABS).put(base, tabId);
        tx.objectStore(META).put(meta, tabId);
        putAccounts(tx.objectStore(ACCOUNTS), tabId, writes.changed);
        putAccounts(tx.objectStore(SAVED_ACCOUNTS), tabId, writes.saved);
        await committed(tx);
      },

      // Never touches the base: an edit writes ~1 KB however large the master is.
      async update(meta, writes) {
        const tx = (await db()).transaction([META, ...ACCOUNT_STORES], 'readwrite');
        const metas = tx.objectStore(META);
        if ((await done(metas.getKey(tabId))) === undefined) {
          tx.abort();
          throw new Error('Nothing stored for this tab yet');
        }
        metas.put(meta, tabId);
        const accounts = tx.objectStore(ACCOUNTS);
        for (const key of writes.removed) {
          accounts.delete([tabId, key]);
        }
        putAccounts(accounts, tabId, writes.changed);
        putAccounts(tx.objectStore(SAVED_ACCOUNTS), tabId, writes.saved);
        await committed(tx);
      },
    };
  }

  return {
    forTab,

    async tabIds() {
      const tx = (await db()).transaction(TABS, 'readonly');
      return (await done(tx.objectStore(TABS).getAllKeys())).map(String);
    },

    async copyTab(from, to) {
      const tx = (await db()).transaction([TABS, META, ...ACCOUNT_STORES], 'readwrite');
      const tabs = tx.objectStore(TABS);
      const metas = tx.objectStore(META);
      const [base, meta, ...accountSets] = await Promise.all([
        done(tabs.get(from)) as Promise<unknown>,
        done(metas.get(from)) as Promise<TabMeta | undefined>,
        ...ACCOUNT_STORES.map(name => loadAccounts(tx.objectStore(name), from)),
      ]);
      if (base !== undefined && meta) {
        tabs.put(base, to);
        metas.put(meta, to);
        ACCOUNT_STORES.forEach((name, i) => {
          putAccounts(tx.objectStore(name), to, accountSets[i] ?? {});
        });
      }
      await committed(tx);
    },

    async deleteTab(tabId) {
      const tx = (await db()).transaction([TABS, META, ...ACCOUNT_STORES], 'readwrite');
      tx.objectStore(TABS).delete(tabId);
      tx.objectStore(META).delete(tabId);
      for (const name of ACCOUNT_STORES) {
        tx.objectStore(name).delete(tabRange(tabId));
      }
      await committed(tx);
    },
  };
}

interface MemoryTab {
  base: unknown;
  meta: TabMeta;
  changed: Map<string, unknown>;
  saved: Map<string, unknown>;
}

function cloneRecords(records: Map<string, unknown>): Record<string, unknown> {
  const out = Object.create(null) as Record<string, unknown>;
  for (const [key, record] of records) {
    out[key] = structuredClone(record);
  }
  return out;
}

function putRecords(target: Map<string, unknown>, records: Record<string, unknown>): void {
  for (const [key, record] of Object.entries(records)) {
    target.set(key, structuredClone(record));
  }
}

/** In-memory version: tests, and browsers without IndexedDB (work then survives only while the tab is open). */
export function createMemoryTabDatabase(): TabDatabase {
  const tabs = new Map<string, MemoryTab>();

  return {
    forTab(tabId) {
      return {
        durable: false,
        load() {
          const tab = tabs.get(tabId);
          if (!tab) {
            return Promise.resolve(null);
          }
          return Promise.resolve({
            base: structuredClone(tab.base),
            meta: structuredClone(tab.meta),
            changed: cloneRecords(tab.changed),
            saved: cloneRecords(tab.saved),
          });
        },
        replace(base, meta, writes) {
          const tab: MemoryTab = {
            base: structuredClone(base),
            meta: structuredClone(meta),
            changed: new Map(),
            saved: new Map(),
          };
          putRecords(tab.changed, writes.changed);
          putRecords(tab.saved, writes.saved);
          tabs.set(tabId, tab);
          return Promise.resolve();
        },
        update(meta, writes) {
          const tab = tabs.get(tabId);
          if (!tab) {
            return Promise.reject(new Error('Nothing stored for this tab yet'));
          }
          tab.meta = structuredClone(meta);
          for (const key of writes.removed) {
            tab.changed.delete(key);
          }
          putRecords(tab.changed, writes.changed);
          putRecords(tab.saved, writes.saved);
          return Promise.resolve();
        },
      };
    },
    tabIds: () => Promise.resolve([...tabs.keys()]),
    copyTab(from, to) {
      const tab = tabs.get(from);
      if (tab) {
        tabs.set(to, {
          base: structuredClone(tab.base),
          meta: structuredClone(tab.meta),
          changed: new Map(tab.changed),
          saved: new Map(tab.saved),
        });
      }
      return Promise.resolve();
    },
    deleteTab(tabId) {
      tabs.delete(tabId);
      return Promise.resolve();
    },
  };
}
