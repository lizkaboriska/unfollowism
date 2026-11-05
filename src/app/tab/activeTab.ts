/** The Web Locks this needs, injectable for tests; null where the browser has none. */
export type TabLocks = Pick<LockManager, 'request'> | null;

/** The channel tabs tell each other about a takeover on, injectable for tests; null where the browser has none. */
export type TabChannel = Pick<BroadcastChannel, 'postMessage' | 'addEventListener'> | null;

const LOCK_NAME = 'unfollowism:active-tab';
const CHANNEL_NAME = 'unfollowism:active-tab';
const TOOK_OVER = 'took-over';

/**
 * The app works in one tab at a time, so two tabs never write over each other's work in the shared browser backup.
 * The active tab holds a Web Lock for as long as it is open; the browser releases it when the tab closes.
 */
export interface ActiveTab {
  /** Becomes the active tab if no other tab is; resolves false if another tab is. Never rejects. */
  claim(): Promise<boolean>;
  /** "Use here": takes the lock from the other tab (which gets `onLost`) and resolves once this tab is active. */
  takeOver(): Promise<void>;
}

/**
 * `onLost`: another tab took over; this tab must stop working on the backup. It comes from that tab's message, not
 * from the lock being let go: iPhone Safari lets it go on a plain reload too, and reloading then would loop.
 */
export function activeTab(locks: TabLocks, channel: TabChannel, onLost: () => void): ActiveTab {
  let wasActive = false;
  channel?.addEventListener('message', event => {
    if (wasActive && event.data === TOOK_OVER) {
      onLost();
    }
  });

  /** Requests the lock and keeps it until the tab closes or another tab takes it. Resolves whether it was granted. */
  function hold(options: LockOptions): Promise<boolean> {
    if (!locks) {
      return Promise.resolve(true); // can't tell tabs apart: every tab works, as before
    }
    return new Promise((resolve, reject) => {
      locks
        .request(LOCK_NAME, options, lock => {
          wasActive = lock !== null;
          resolve(wasActive);
          // never settles: held for the tab's lifetime
          return wasActive ? new Promise<void>(() => undefined) : undefined;
        })
        .catch((error: unknown) => {
          if (!wasActive) {
            reject(error instanceof Error ? error : new Error(String(error)));
          } // else the held lock was let go: taken by another tab (its message says so) or this page is closing
        });
    });
  }

  return {
    async claim() {
      try {
        return await hold({ ifAvailable: true });
      } catch (error) {
        // Chrome refuses the lock when the site may not store data: work without it rather than not start at all.
        console.error('Could not get the tab lock, working without it:', error);
        return true;
      }
    },
    async takeOver() {
      try {
        await hold({ steal: true });
      } catch (error) {
        // A browser that refuses to take the lock: work here anyway rather than leave the user stuck.
        console.error('Could not take over from the other tab:', error);
      }
      channel?.postMessage(TOOK_OVER);
    },
  };
}

/** The browser's Web Locks, or null where it has none. */
export function browserTabLocks(): TabLocks {
  return typeof navigator !== 'undefined' && 'locks' in navigator ? navigator.locks : null;
}

/** The browser's channel between this site's tabs, or null where it has none. */
export function browserTabChannel(): TabChannel {
  return typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL_NAME);
}
