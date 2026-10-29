import type { LastSavedStore } from '../io/lastSaved.ts';
import type { TabStore } from '../io/tabStore.ts';

/** Side effects injected into thunks (thunk `extra`), so tests can replace them. */
export interface StoreDeps {
  now: () => Date;
  download: (filename: string, text: string) => void | Promise<void>;
  /** This tab's reload safety net. */
  tab: TabStore;
  lastSaved: LastSavedStore;
}
