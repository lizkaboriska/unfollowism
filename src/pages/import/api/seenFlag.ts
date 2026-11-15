import { safeLocalStorage } from '@/shared/lib/safeLocalStorage.ts';
import type { ValueOf } from '@/shared/lib/valueOf.ts';

/** The popups that open by themselves only until this browser has seen them, by their localStorage key. */
export const SEEN_FLAGS = {
  HOW_IT_WORKS: 'unfollowism:how-it-works-seen',
  INSTALL_HINT: 'unfollowism:install-hint-seen',
} as const;

export type SeenFlagKey = ValueOf<typeof SEEN_FLAGS>;

/**
 * Whether this browser has seen a popup (localStorage), so it opens by itself only until then.
 * Blocked or cleared storage counts as not seen: the popup just opens again.
 */
export interface SeenFlag {
  get(): boolean;
  set(): void;
}

export function localStorageSeenFlag(
  key: SeenFlagKey,
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
