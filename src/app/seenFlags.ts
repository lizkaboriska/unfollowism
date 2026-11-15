import { localStorageSeenFlag, type SeenFlag } from '@/shared/lib/seenFlag.ts';

/** What shows by itself only until this browser has seen or closed it. */
export interface SeenFlags {
  /** How it works, on the first visit. */
  howItWorks: SeenFlag;
  /** The Home Screen popup at the first Start in an iPhone/iPad Safari tab, until Continue in Safari. */
  installHint: SeenFlag;
  /** The iPhone notice on Review, until its ×. */
  installNotice: SeenFlag;
}

export function localStorageSeenFlags(): SeenFlags {
  return {
    howItWorks: localStorageSeenFlag('unfollowism:how-it-works-seen'),
    installHint: localStorageSeenFlag('unfollowism:install-hint-seen'),
    installNotice: localStorageSeenFlag('unfollowism:install-notice-closed'),
  };
}
