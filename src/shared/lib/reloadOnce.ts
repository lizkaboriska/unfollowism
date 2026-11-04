/** Two reloads closer together than this are a loop (the file is really missing, or there's no connection). */
export const RELOAD_COOLDOWN_MS = 10_000;

const KEY = 'unfollowism:last-reload-at';

export interface ReloadOnceDeps {
  /** This tab's sessionStorage; null when it's blocked. */
  storage: Pick<Storage, 'getItem' | 'setItem'> | null;
  now: () => number;
  reload: () => void;
}

function safeSessionStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/**
 * Reloads the page to pick up a new release, e.g. when a file split out of the app is gone after a release. Reloads at
 * most once per cooldown, and never when sessionStorage can't record it: without the record, a file that's really
 * missing would reload the page forever. Returns whether it reloaded.
 */
export function reloadOnce({
  storage = safeSessionStorage(),
  now = Date.now,
  reload = () => {
    window.location.reload();
  },
}: Partial<ReloadOnceDeps> = {}): boolean {
  try {
    if (storage === null) {
      return false;
    }
    const last = Number(storage.getItem(KEY));
    if (now() - last < RELOAD_COOLDOWN_MS) {
      return false;
    }
    storage.setItem(KEY, String(now()));
  } catch {
    return false;
  }
  reload();
  return true;
}
