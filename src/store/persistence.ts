import type { ListenerMiddlewareInstance } from "@reduxjs/toolkit";
import { toAccountRecord, toMasterFile, type Account, type AccountRecord, type DeepReadonly, type Master } from "../core/index.ts";
import type { TabMeta } from "../io/tabStore.ts";
import type { StoreDeps } from "./deps.ts";
import { persistenceFailed, type MasterState } from "./masterSlice.ts";
import { restoreTab } from "./thunks.ts";
import type { AppDispatch, RootState } from "./index.ts";

type Accounts = DeepReadonly<Record<string, Account>>;

function toMeta(state: MasterState, master: DeepReadonly<Master>, storedAt: string): TabMeta {
  return {
    revision: state.revision,
    savedRevision: state.savedRevision,
    message: state.message,
    tag_options: [...master.tag_options],
    ...(master.last_saved_at === undefined ? {} : { last_saved_at: master.last_saved_at }),
    storedAt,
  };
}

/** Accounts whose object differs from `before`. Immer keeps unchanged accounts identical, so this is a cheap reference check. */
function changedAccounts(before: Accounts | null, after: Accounts): Record<string, AccountRecord> {
  const changed: Record<string, AccountRecord> = {};
  for (const [key, account] of Object.entries(after)) {
    if (before?.[key] !== account) changed[key] = toAccountRecord(account);
  }
  return changed;
}

/**
 * Keeps this tab's reload safety net up to date on every change:
 * - a new import stores the whole master once (it is also the session baseline);
 * - an edit stores only the accounts that changed (~1 KB each), however large the master;
 * - a change arriving while a write is running is folded into one follow-up write.
 */
export function startPersistence(listener: ListenerMiddlewareInstance<RootState, AppDispatch, StoreDeps>): void {
  let storedBaseline: DeepReadonly<Master> | null = null;
  let storedAccounts: Accounts | null = null;
  let changes = 0;
  let writing = false;

  // A restore puts back exactly what is stored: remember it instead of writing it again.
  listener.startListening({
    actionCreator: restoreTab.fulfilled,
    effect: (_action, api) => {
      const { master, baseline } = api.getState().master;
      storedBaseline = baseline;
      storedAccounts = master?.accounts ?? null;
    },
  });

  async function writeLatest(api: { getState: () => RootState; extra: StoreDeps; dispatch: AppDispatch }): Promise<void> {
    const state = api.getState().master;
    const { master, baseline } = state;
    if (!master || !baseline) return;
    const meta = toMeta(state, master, api.extra.now().toISOString());
    try {
      if (baseline !== storedBaseline) {
        await api.extra.tab.replace(toMasterFile(baseline), meta, changedAccounts(baseline.accounts, master.accounts));
      } else {
        await api.extra.tab.update(meta, changedAccounts(storedAccounts, master.accounts));
      }
      storedBaseline = baseline;
      storedAccounts = master.accounts;
    } catch {
      // Keep the old references so the next write retries everything changed since the last success.
      if (!api.getState().master.persistenceFailed) api.dispatch(persistenceFailed());
    }
  }

  listener.startListening({
    predicate: (action, current, previous) =>
      !restoreTab.fulfilled.match(action) &&
      (current.master.master !== previous.master.master || current.master.savedRevision !== previous.master.savedRevision),
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
