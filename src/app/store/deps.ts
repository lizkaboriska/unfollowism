import type { LastSavedStore } from '@/entities/master/api/lastSaved.ts';
import type { TabStore } from '@/entities/master/api/tabStore.ts';
import type { AddressBar } from '@/shared/url/addressBar.ts';

/** Side effects injected into thunks (thunk `extra`), so tests can replace them. */
export interface StoreDeps {
  now: () => Date;
  download: (filename: string, text: string) => void | Promise<void>;
  /** This tab's reload safety net. */
  tab: TabStore;
  lastSaved: LastSavedStore;
  /** Where the page and Review's filters are shown, so a reload keeps them (see urlSync.ts). */
  address: AddressBar;
}
