import { persistenceStopped } from '@/app/store/persistence.ts';
import type { AppStore } from '@/app/store/store.ts';
import { selectIsDirty } from '@/entities/master';

export interface TakenOverActions {
  /** Turns off the "Leave site?" guard. */
  stopGuard: () => void;
  reload: () => void;
  /** Shows the This tab stopped page instead of the app, with this store's work. */
  showStopped: (store: AppStore) => void;
}

/**
 * Another tab took over (see activeTab.ts). `store` is null while the app is still starting (nothing to lose yet);
 * `durable` is false when the backup lives in memory only.
 * - Stored work, or nothing unsaved: it moved to the other tab, or is in the progress file. Reload, which shows Open
 *   in another tab, without "Leave site?".
 * - Unsaved work that isn't stored (storage off, or writes failing): a reload would lose it. Stop writing, so a late
 *   retry can't overwrite the other tab's backup; keep the guard; show This tab stopped, where it can still be saved.
 */
export function handleTakenOver(store: AppStore | null, durable: boolean, actions: TakenOverActions): void {
  const state = store?.getState();
  const stored = durable && state?.master.persistenceFailed !== true;
  if (!store || !state || stored || !selectIsDirty(state)) {
    actions.stopGuard();
    actions.reload();
    return;
  }
  store.dispatch(persistenceStopped());
  actions.showStopped(store);
}
