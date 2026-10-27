/**
 * Browser-local safety net for unsaved work. The downloaded master file stays the
 * source of truth; this only lets a closed tab resume where it left off.
 */
export interface StoredSession {
  master: unknown;
  baseline: unknown;
  revision: number;
  savedRevision: number;
  pendingSnapshot: boolean;
  message: string;
  /** ISO time this draft was written. */
  storedAt: string;
}

export interface SessionStore {
  loadSession(): Promise<StoredSession | null>;
  saveSession(session: StoredSession): Promise<void>;
  clearSession(): Promise<void>;
  /** last_saved_at of the most recent master downloaded from this browser. */
  getLastSavedAt(): Promise<string | null>;
  setLastSavedAt(value: string): Promise<void>;
}

const DB_NAME = "instagram-review";
const STORE = "kv";
const SESSION_KEY = "session";
const LAST_SAVED_KEY = "lastSavedAt";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => { resolve(req.result); };
    req.onerror = () => { reject(req.error ?? new Error("IndexedDB request failed")); };
  });
}

export function createIndexedDbSessionStore(factory: IDBFactory = indexedDB): SessionStore {
  let dbPromise: Promise<IDBDatabase> | null = null;

  function db(): Promise<IDBDatabase> {
    dbPromise ??= new Promise((resolve, reject) => {
      const open = factory.open(DB_NAME, 1);
      open.onupgradeneeded = () => { open.result.createObjectStore(STORE); };
      open.onsuccess = () => { resolve(open.result); };
      open.onerror = () => { reject(open.error ?? new Error("Could not open browser storage")); };
    });
    return dbPromise;
  }

  async function get(key: string): Promise<unknown> {
    const tx = (await db()).transaction(STORE, "readonly");
    return request(tx.objectStore(STORE).get(key));
  }

  async function put(key: string, value: unknown): Promise<void> {
    const tx = (await db()).transaction(STORE, "readwrite");
    await request(tx.objectStore(STORE).put(value, key));
  }

  async function remove(key: string): Promise<void> {
    const tx = (await db()).transaction(STORE, "readwrite");
    await request(tx.objectStore(STORE).delete(key));
  }

  return {
    async loadSession() {
      const value = await get(SESSION_KEY);
      return isStoredSession(value) ? value : null;
    },
    saveSession: session => put(SESSION_KEY, session),
    clearSession: () => remove(SESSION_KEY),
    async getLastSavedAt() {
      const value = await get(LAST_SAVED_KEY);
      return typeof value === "string" ? value : null;
    },
    setLastSavedAt: value => put(LAST_SAVED_KEY, value),
  };
}

function isStoredSession(value: unknown): value is StoredSession {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<StoredSession>;
  return typeof v.revision === "number" && typeof v.savedRevision === "number" && typeof v.storedAt === "string" && v.master != null;
}

/** For tests and for browsers where IndexedDB is unavailable (e.g. some private modes). */
export function createMemorySessionStore(): SessionStore {
  let session: StoredSession | null = null;
  let lastSavedAt: string | null = null;
  return {
    loadSession: () => Promise.resolve(session ? structuredClone(session) : null),
    saveSession: s => { session = structuredClone(s); return Promise.resolve(); },
    clearSession: () => { session = null; return Promise.resolve(); },
    getLastSavedAt: () => Promise.resolve(lastSavedAt),
    setLastSavedAt: v => { lastSavedAt = v; return Promise.resolve(); },
  };
}
