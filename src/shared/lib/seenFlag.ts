import { safeLocalStorage } from '@/shared/lib/safeLocalStorage.ts';

/**
 * Whether this browser has seen a popup (localStorage), so it opens by itself only until then.
 * Blocked or cleared storage counts as not seen: the popup just opens again.
 */
export interface SeenFlag {
  get(): boolean;
  set(): void;
}

export function localStorageSeenFlag(
  /** The localStorage key, one per popup. */
  key: string,
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage(),
): SeenFlag {
  return {
    get() {
      try {
        return storage?.getItem(key) === 'true';
      } catch {
        return false;
      }
    },
    set() {
      try {
        storage?.setItem(key, 'true');
      } catch {
        // Storage blocked or full: the popup opens again next time.
      }
    },
  };
}

export function memorySeenFlag(wasSeen = false): SeenFlag {
  let isSeen = wasSeen;
  return {
    get: () => isSeen,
    set: () => {
      isSeen = true;
    },
  };
}
