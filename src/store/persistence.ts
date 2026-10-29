import type { ListenerMiddlewareInstance } from '@reduxjs/toolkit';
import {
  createDict,
  toAccountRecord,
  toMasterFile,
  type AccountRecord,
  type ChangedAccounts,
  type DeepReadonly,
  type Master,
} from '../core/index.ts';
import type { TabMeta } from '../io/tabStore.ts';
import type { StoreDeps } from './deps.ts';
import { persistenceFailed, persistenceRecovered, type MasterState } from './masterSlice.ts';
import { restoreTab } from './thunks.ts';
import type { AppDispatch, RootState } from './index.ts';

type Accounts = DeepReadonly<ChangedAccounts>;

/** Waits before each retry of a failed write. */
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

function toMeta(state: MasterState, storedAt: string): TabMeta {
  return {
    revision: state.revision,
    savedRevision: state.savedRevision,
    ...(state.savedAt === null ? {} : { lastSavedAt: state.savedAt }),
    storedAt,
  };
}

/**
 * Accounts whose object differs from what was last stored (null = removed). Only looks at edited accounts.
 * `savedAt` is the stored base's, so a reloaded account matches its base again (see toAccountRecord).
 */
function newlyChanged(
  stored: Accounts | null,
  current: Accounts,
  savedAt: string | undefined,
): Record<string, AccountRecord | null> {
  const records = createDict<AccountRecord | null>();
  if (stored === current) return records;
  for (const [key, account] of Object.entries(current)) {
    if (stored?.[key] !== account) records[key] = account && toAccountRecord(account, savedAt);
  }
  return records;
}

/** Accounts stored as changed that no longer are (after Reset changes). */
function noLongerChanged(stored: Accounts | null, current: Accounts): string[] {
  if (!stored || stored === current) return [];
  return Object.keys(stored).filter(key => !Object.hasOwn(current, key));
}

/**
 * Keeps this tab's reload safety net up to date on every change:
 * - a new import stores the whole master once (it is also the session baseline);
 * - an edit stores only the edited account (~1 KB), however large the master;
 * - a save stores the edited accounts as written to the file, for Reset changes after a reload;
 * - a change arriving while a write is running is folded into one follow-up write;
 * - a failed write is retried after each of RETRY_DELAYS_MS, then on the next change.
 */
export function startPersistence(listener: ListenerMiddlewareInstance<RootState, AppDispatch, StoreDeps>): void {
  let storedBase: DeepReadonly<Master> | null = null;
  let storedChanged: Accounts | null = null;
  let storedSaved: Accounts | null = null;
  let changes = 0;
  let writing = false;

  // A restore puts back exactly what is stored: remember it instead of writing it again.
  listener.startListening({
    actionCreator: restoreTab.fulfilled,
    effect: (_action, api) => {
      const { base, changed, savedChanged } = api.getState().master;
      storedBase = base;
      storedChanged = base ? changed : null;
      storedSaved = base ? savedChanged : null;
    },
  });

  /** True when storage now holds the latest state (or there is nothing to store). */
  async function writeLatest(api: {
    getState: () => RootState;
    extra: StoreDeps;
    dispatch: AppDispatch;
  }): Promise<boolean> {
    const state = api.getState().master;
    const { base, changed, savedChanged } = state;
    if (!base) return true;
    const meta = toMeta(state, api.extra.now().toISOString());
    try {
      if (base !== storedBase) {
        await api.extra.tab.replace(toMasterFile(base), meta, {
          changed: newlyChanged(null, changed, base.lastSavedAt),
          saved: newlyChanged(null, savedChanged, base.lastSavedAt),
        });
      } else {
        await api.extra.tab.update(meta, {
          changed: newlyChanged(storedChanged, changed, base.lastSavedAt),
          removed: noLongerChanged(storedChanged, changed),
          saved: newlyChanged(storedSaved, savedChanged, base.lastSavedAt),
        });
      }
      storedBase = base;
      storedChanged = changed;
      storedSaved = savedChanged;
      if (api.getState().master.persistenceFailed) api.dispatch(persistenceRecovered());
      return true;
    } catch (error) {
      console.error("Writing the tab's backup to browser storage failed:", error);
      // Storage may now hold anything (or nothing, if the tab's data was deleted): the next write starts over with
      // replace.
      storedBase = null;
      storedChanged = null;
      storedSaved = null;
      if (!api.getState().master.persistenceFailed) api.dispatch(persistenceFailed());
      return false;
    }
  }

  listener.startListening({
    predicate: (action, current, previous) =>
      !restoreTab.fulfilled.match(action) &&
      (current.master.base !== previous.master.base ||
        current.master.changed !== previous.master.changed ||
        current.master.savedChanged !== previous.master.savedChanged ||
        current.master.savedRevision !== previous.master.savedRevision),
    effect: async (_action, api) => {
      changes += 1;
      if (writing) return; // the running loop below will pick this change up
      writing = true;
      try {
        let written = 0;
        let failures = 0;
        while (written < changes) {
          written = changes;
          if (await writeLatest(api)) {
            failures = 0;
            continue;
          }
          const delay = RETRY_DELAYS_MS[failures];
          if (delay === undefined) break; // given up: the next change tries again
          failures += 1;
          await api.delay(delay);
          written = 0; // retry, including anything that changed meanwhile
        }
      } finally {
        writing = false;
      }
    },
  });
}
