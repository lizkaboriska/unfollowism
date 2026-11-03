import type { TabDatabase } from '@/entities/master';

/** The browser APIs this needs, injectable for tests. */
export interface TabEnvironment {
  /** sessionStorage: survives a reload, cleared when the tab closes, copied by "Duplicate tab". */
  session: Pick<Storage, 'getItem' | 'setItem'> | null;
  /** Web Locks: held while the tab is open, released automatically when it closes. */
  locks: Pick<LockManager, 'request' | 'query'> | null;
  newId: () => string;
}

const TAB_ID_KEY = 'unfollowism:tab';
const lockName = (tabId: string) => `unfollowism:tab:${tabId}`;

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null; // blocked by browser settings
  }
}

export function browserTabEnvironment(): TabEnvironment {
  return {
    session: safeSessionStorage(),
    locks: typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null,
    newId: () => crypto.randomUUID(),
  };
}

/** Takes the lock for this tab id and keeps it until the tab closes. Resolves false if another tab holds it. */
function holdLock(locks: TabEnvironment['locks'], tabId: string): Promise<boolean> {
  if (!locks) {
    return Promise.resolve(true);
  }
  return new Promise(resolve => {
    void locks.request(lockName(tabId), { ifAvailable: true }, lock => {
      resolve(lock !== null);
      return lock ? new Promise<void>(() => undefined) : undefined; // never settle: held for the tab's lifetime
    });
  });
}

/**
 * Works out which stored data belongs to this tab:
 * - reload: same id (from sessionStorage), its data is restored;
 * - "Duplicate tab": the id is copied but already locked by the original, so the copy
 *   gets a new id and a copy of the data;
 * - data of tabs that are no longer open (nobody holds their lock) is deleted.
 */
export async function claimTab(database: TabDatabase, env: TabEnvironment): Promise<string> {
  let tabId = readId(env);
  if (tabId && !(await holdLock(env.locks, tabId))) {
    const original = tabId;
    tabId = env.newId();
    await database.copyTab(original, tabId);
    await holdLock(env.locks, tabId);
  } else if (!tabId) {
    tabId = env.newId();
    await holdLock(env.locks, tabId);
  }
  writeId(env, tabId);
  await removeClosedTabs(database, env, tabId).catch(() => undefined); // best effort
  return tabId;
}

async function removeClosedTabs(database: TabDatabase, env: TabEnvironment, ownId: string): Promise<void> {
  if (!env.locks) {
    return;
  } // can't tell open tabs from closed ones; leave the data alone
  const held = new Set(((await env.locks.query()).held ?? []).map(lock => lock.name));
  for (const id of await database.tabIds()) {
    if (id !== ownId && !held.has(lockName(id))) {
      await database.deleteTab(id);
    }
  }
}

function readId(env: TabEnvironment): string | null {
  try {
    return env.session?.getItem(TAB_ID_KEY) ?? null;
  } catch {
    return null;
  }
}

function writeId(env: TabEnvironment, tabId: string): void {
  try {
    env.session?.setItem(TAB_ID_KEY, tabId);
  } catch {
    // Without sessionStorage a reload starts fresh; the in-tab session still works.
  }
}
