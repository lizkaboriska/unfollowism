import type { LastSavedStore, BackupStore } from '@/entities/master';
import type { AddressBar } from '@/shared/url/addressBar.ts';

/** Side effects injected into thunks (thunk `extra`), so tests can replace them. */
export interface StoreDeps {
  now: () => Date;
  /** Waits until the browser has painted, so a busy state shows before slow work starts. */
  nextPaint: () => Promise<void>;
  download: (filename: string, text: string) => void | Promise<void>;
  /** This tab's reload safety net. */
  backup: BackupStore;
  lastSaved: LastSavedStore;
  /** Where the page and Review's filters are shown, so a reload keeps them (see urlSync.ts). */
  address: AddressBar;
}
