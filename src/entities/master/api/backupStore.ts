import type { AccountRecord, MasterFile } from '../lib/masterFile.ts';
import type { ImportFacts } from '../lib/types.ts';

/**
 * The browser backup, so a reload or a closed browser doesn't lose work; one for the whole browser. It keeps the
 * imported master once (`base`, which is also the session baseline) plus a record for every account changed since, so
 * an edit writes ~1 KB however large the master is. It also keeps the changed accounts as they were in the last
 * downloaded file, so Reset changes still works after a reload. The downloaded master file stays the real record.
 */
export interface BackupMeta {
  revision: number;
  savedRevision: number;
  /** The master's lastSavedAt, which changes on every save. */
  lastSavedAt?: string;
  /** When the backup was last written. */
  storedAt: string;
  /** What the import found besides the master (see ImportFacts). */
  importFacts: ImportFacts;
}

export interface StoredBackup {
  base: unknown;
  meta: BackupMeta;
  /** Account key → latest record (null = removed), for accounts changed since import. */
  changed: Record<string, unknown>;
  /** Account key → record as in the last downloaded file, for accounts changed between import and that save. */
  saved: Record<string, unknown>;
}

/**
 * Account records to write: changed accounts, and accounts as they were in the last downloaded file. null = removed
 * since the import.
 */
export interface BackupWrites {
  changed: Record<string, AccountRecord | null>;
  saved: Record<string, AccountRecord | null>;
}

export interface BackupStore {
  /** False for the in-memory fallback: work then does not survive a reload. */
  readonly durable: boolean;
  load(): Promise<StoredBackup | null>;
  /** New import: drops everything stored and starts over from `base`. */
  replace(base: MasterFile, meta: BackupMeta, writes: BackupWrites): Promise<void>;
  /** An edit, save or reset: writes only the given accounts; `removed` are no longer changed (after a reset). */
  update(meta: BackupMeta, writes: BackupWrites & { removed: string[] }): Promise<void>;
}

const DB_NAME = 'unfollowism';
// Bump on any change of the stored shape: older data is dropped, not migrated.
const DB_VERSION = 7;
const BASE = 'base'; // KEY → base
const META = 'meta'; // KEY → BackupMeta. Rewritten on every edit, so kept apart from the (large) base.
const ACCOUNTS = 'accounts'; // accountKey → AccountRecord
const SAVED_ACCOUNTS = 'savedAccounts'; // accountKey → AccountRecord
const ACCOUNT_STORES = [ACCOUNTS, SAVED_ACCOUNTS] as const;
const KEY = 'backup';

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

/** Account key → record, from one account store. */
async function loadAccounts(store: IDBObjectStore): Promise<Record<string, unknown>> {
  const [keys, records] = await Promise.all([done(store.getAllKeys()), done(store.getAll())]);
  const accounts: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  keys.forEach((key, i) => {
    accounts[key as string] = records[i];
  });
  return accounts;
}

function putAccounts(store: IDBObjectStore, records: Record<string, unknown>): void {
  for (const [key, record] of Object.entries(records)) {
    store.put(record, key);
  }
}

/** Opens the database first, so a browser that blocks storage fails here (the caller then keeps work in memory). */
export async function openIndexedDbBackupStore(factory: IDBFactory = indexedDB): Promise<BackupStore> {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function db(): Promise<IDBDatabase> {
    dbPromise ??= new Promise((resolve, reject) => {
      const open = factory.open(DB_NAME, DB_VERSION);
      open.onupgradeneeded = () => {
        const database = open.result;
        for (const name of [...database.objectStoreNames]) {
          database.deleteObjectStore(name);
        }
        for (const name of [BASE, META, ...ACCOUNT_STORES]) {
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
  await db();

  return {
    durable: true,

    async load() {
      const tx = (await db()).transaction([BASE, META, ...ACCOUNT_STORES], 'readonly');
      const [base, meta, changed, saved] = await Promise.all([
        done(tx.objectStore(BASE).get(KEY)) as Promise<unknown>,
        done(tx.objectStore(META).get(KEY)) as Promise<BackupMeta | undefined>,
        loadAccounts(tx.objectStore(ACCOUNTS)),
        loadAccounts(tx.objectStore(SAVED_ACCOUNTS)),
      ]);
      if (base === undefined || !meta) {
        return null;
      }
      return { base, meta, changed, saved };
    },

    async replace(base, meta, writes) {
      const tx = (await db()).transaction([BASE, META, ...ACCOUNT_STORES], 'readwrite');
      for (const name of ACCOUNT_STORES) {
        tx.objectStore(name).clear();
      }
      tx.objectStore(BASE).put(base, KEY);
      tx.objectStore(META).put(meta, KEY);
      putAccounts(tx.objectStore(ACCOUNTS), writes.changed);
      putAccounts(tx.objectStore(SAVED_ACCOUNTS), writes.saved);
      await committed(tx);
    },

    // Never touches the base: an edit writes ~1 KB however large the master is.
    async update(meta, writes) {
      const tx = (await db()).transaction([META, ...ACCOUNT_STORES], 'readwrite');
      const metas = tx.objectStore(META);
      if ((await done(metas.getKey(KEY))) === undefined) {
        tx.abort();
        throw new Error('Nothing stored yet');
      }
      metas.put(meta, KEY);
      const accounts = tx.objectStore(ACCOUNTS);
      for (const key of writes.removed) {
        accounts.delete(key);
      }
      putAccounts(accounts, writes.changed);
      putAccounts(tx.objectStore(SAVED_ACCOUNTS), writes.saved);
      await committed(tx);
    },
  };
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
export function createMemoryBackupStore(): BackupStore {
  let stored: { base: unknown; meta: BackupMeta; changed: Map<string, unknown>; saved: Map<string, unknown> } | null =
    null;

  return {
    durable: false,
    load() {
      if (!stored) {
        return Promise.resolve(null);
      }
      return Promise.resolve({
        base: structuredClone(stored.base),
        meta: structuredClone(stored.meta),
        changed: cloneRecords(stored.changed),
        saved: cloneRecords(stored.saved),
      });
    },
    replace(base, meta, writes) {
      stored = { base: structuredClone(base), meta: structuredClone(meta), changed: new Map(), saved: new Map() };
      putRecords(stored.changed, writes.changed);
      putRecords(stored.saved, writes.saved);
      return Promise.resolve();
    },
    update(meta, writes) {
      if (!stored) {
        return Promise.reject(new Error('Nothing stored yet'));
      }
      stored.meta = structuredClone(meta);
      for (const key of writes.removed) {
        stored.changed.delete(key);
      }
      putRecords(stored.changed, writes.changed);
      putRecords(stored.saved, writes.saved);
      return Promise.resolve();
    },
  };
}
