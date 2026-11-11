import { safeLocalStorage } from '@/shared/lib/safeLocalStorage.ts';

/**
 * Whether this browser has seen the How it works popup (localStorage), so it opens by itself only on the first visit.
 * Blocked or cleared storage counts as not seen: the popup just opens again.
 */
export interface HowItWorksSeen {
  get(): boolean;
  set(): void;
}

const KEY = 'unfollowism:how-it-works-seen';

export function localStorageHowItWorksSeen(
  storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeLocalStorage(),
): HowItWorksSeen {
  return {
    get() {
      try {
        return storage?.getItem(KEY) === 'true';
      } catch {
        return false;
      }
    },
    set() {
      try {
        storage?.setItem(KEY, 'true');
      } catch {
        // Storage blocked or full: the popup opens again next time.
      }
    },
  };
}

export function memoryHowItWorksSeen(wasSeen = false): HowItWorksSeen {
  let isSeen = wasSeen;
  return {
    get: () => isSeen,
    set: () => {
      isSeen = true;
    },
  };
}
