import type { ListenerMiddlewareInstance } from "@reduxjs/toolkit";
import { createDict, toAccountRecord, toMasterFile, type Account, type AccountRecord, type DeepReadonly, type Master } from "../core/index.ts";
import type { TabMeta } from "../io/tabStore.ts";
import type { StoreDeps } from "./deps.ts";
import { persistenceFailed, type MasterState } from "./masterSlice.ts";
import { restoreTab } from "./thunks.ts";
import type { AppDispatch, RootState } from "./index.ts";

type Accounts = DeepReadonly<Record<string, Account>>;

function toMeta(state: MasterState, storedAt: string): TabMeta {
  return {
    revision: state.revision,
    savedRevision: state.savedRevision,
    ...(state.savedAt === null ? {} : { lastSavedAt: state.savedAt }),
    storedAt,
  };
}

/** Accounts whose object differs from what was last stored. Only looks at edited accounts. */
function newlyChanged(stored: Accounts | null, current: Accounts): Record<string, AccountRecord> {
  const records = createDict<AccountRecord>();
  if (stored === current) return records;
  for (const [key, account] of Object.entries(current)) {
    if (stored?.[key] !== account) records[key] = toAccountRecord(account);
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
 * - a change arriving while a write is running is folded into one follow-up write.
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

  async function writeLatest(api: { getState: () => RootState; extra: StoreDeps; dispatch: AppDispatch }): Promise<void> {
    const state = api.getState().master;
    const { base, changed, savedChanged } = state;
    if (!base) return;
    const meta = toMeta(state, api.extra.now().toISOString());
    try {
      if (base !== storedBase) {
        await api.extra.tab.replace(toMasterFile(base), meta, { changed: newlyChanged(null, changed), saved: newlyChanged(null, savedChanged) });
      } else {
        await api.extra.tab.update(meta, {
          changed: newlyChanged(storedChanged, changed),
          removed: noLongerChanged(storedChanged, changed),
          saved: newlyChanged(storedSaved, savedChanged),
        });
      }
      storedBase = base;
      storedChanged = changed;
      storedSaved = savedChanged;
    } catch {
      // Keep the old references so the next write retries everything changed since the last success.
      if (!api.getState().master.persistenceFailed) api.dispatch(persistenceFailed());
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
        while (written < changes) {
          written = changes;
          await writeLatest(api);
        }
      } finally {
        writing = false;
      }
    },
  });
}
