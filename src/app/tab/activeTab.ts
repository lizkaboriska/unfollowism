/** The Web Locks this needs, injectable for tests; null where the browser has none. */
export type TabLocks = Pick<LockManager, 'request'> | null;

const LOCK_NAME = 'unfollowism:active-tab';

/**
 * The app works in one tab at a time, so two tabs never write over each other's work in the shared browser backup.
 * The active tab holds a Web Lock for as long as it is open; the browser releases it when the tab closes.
 */
export interface ActiveTab {
  /** Becomes the active tab if no other tab is; resolves false if another tab is. */
  claim(): Promise<boolean>;
  /** "Use here": takes the lock from the other tab (which gets `onLost`) and resolves once this tab is active. */
  takeOver(): Promise<void>;
}

/** `onLost`: another tab took over; this tab must stop working on the backup. */
export function activeTab(locks: TabLocks, onLost: () => void): ActiveTab {
  /** Requests the lock and keeps it until the tab closes or another tab takes it. Resolves whether it was granted. */
  function hold(options: LockOptions): Promise<boolean> {
    if (!locks) {
      return Promise.resolve(true); // can't tell tabs apart: every tab works, as before
    }
    return new Promise((resolve, reject) => {
      let granted = false;
      locks
        .request(LOCK_NAME, options, lock => {
          granted = lock !== null;
          resolve(granted);
          return granted ? new Promise<void>(() => undefined) : undefined; // never settles: held for the tab's lifetime
        })
        .catch((error: unknown) => {
          if (granted) {
            onLost(); // a held lock's request only fails when another tab steals it
          } else {
            reject(error instanceof Error ? error : new Error(String(error)));
          }
        });
    });
  }

  return {
    claim: () => hold({ ifAvailable: true }),
    async takeOver() {
      try {
        await hold({ steal: true });
      } catch (error) {
        // A browser that refuses to take the lock: work here anyway rather than leave the user stuck.
        console.error('Could not take over from the other tab:', error);
      }
    },
  };
}

/** The browser's Web Locks, or null where it has none. */
export function browserTabLocks(): TabLocks {
  return typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null;
}
