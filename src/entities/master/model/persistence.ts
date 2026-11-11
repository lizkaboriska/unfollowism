import { createAction, type ListenerMiddlewareInstance } from '@reduxjs/toolkit';

import type { StoreDeps } from '@/app/store/deps.ts';
import type { AppDispatch, RootState } from '@/app/store/store.ts';
import { createDict } from '@/shared/lib/createDict.ts';
import type { DeepReadonly } from '@/shared/lib/deepReadonly.ts';

import type { ChangedAccounts } from '../lib/account.ts';
import { type BackupMeta, toAccountRecord, toMasterFile, type AccountRecord } from '../lib/masterFile.ts';
import type { ImportFacts, Master } from '../lib/types.ts';

import { persistenceFailed, persistenceRecovered, type MasterState } from './masterSlice.ts';
import { restoreBackup } from './thunks.ts';

type Accounts = DeepReadonly<ChangedAccounts>;

/** Waits before each retry of a failed write. */
export const RETRY_DELAYS_MS = [1_000, 2_000, 4_000, 8_000, 16_000] as const;

/** Another tab took over the backup: this tab writes nothing more to it, not even a pending retry. */
export const persistenceStopped = createAction('persistence/stopped');

function toMeta(state: MasterState, importFacts: ImportFacts): BackupMeta {
  return {
    revision: state.revision,
    savedRevision: state.savedRevision,
    ...(state.savedAt === null ? {} : { lastSavedAt: state.savedAt }),
    importFacts,
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
  if (stored === current) {
    return records;
  }
  for (const [key, account] of Object.entries(current)) {
    if (stored?.[key] !== account) {
      records[key] = account && toAccountRecord(account, savedAt);
    }
  }
  return records;
}

/** Accounts stored as changed that no longer are (after Reset changes). */
function noLongerChanged(stored: Accounts | null, current: Accounts): string[] {
  if (!stored || stored === current) {
    return [];
  }
  return Object.keys(stored).filter(key => !Object.hasOwn(current, key));
}

/**
 * Keeps the browser backup up to date on every change:
 * - a new import stores the whole master once (it is also the session baseline);
 * - an edit stores only the edited account (~1 KB), however large the master;
 * - a save stores the edited accounts as written to the file, for Reset changes after a reload;
 * - a change arriving while a write is running is folded into one follow-up write;
 * - a failed write is retried after each of RETRY_DELAYS_MS, then on the next change;
 * - after persistenceStopped, nothing is written.
 */
export function startPersistence(listener: ListenerMiddlewareInstance<RootState, AppDispatch, StoreDeps>): void {
  let storedBase: DeepReadonly<Master> | null = null;
  let storedChanged: Accounts | null = null;
  let storedSaved: Accounts | null = null;
  let changes = 0;
  let isWriting = false;
  let isStopped = false;

  listener.startListening({
    actionCreator: persistenceStopped,
    effect: () => {
      isStopped = true;
    },
  });

  // A restore puts back exactly what is stored: remember it instead of writing it again.
  listener.startListening({
    actionCreator: restoreBackup.fulfilled,
    effect: (_action, api) => {
      const { base, changed, savedChanged } = api.getState().master;
      storedBase = base;
      storedChanged = base ? changed : null;
      storedSaved = base ? savedChanged : null;
    },
  });

  /** True when storage now holds the latest state (or there is nothing to store, or this tab stopped writing). */
  async function writeLatest(api: {
    getState: () => RootState;
    extra: StoreDeps;
    dispatch: AppDispatch;
  }): Promise<boolean> {
    if (isStopped) {
      return true;
    }
    const state = api.getState().master;
    const { base, changed, savedChanged, importFacts } = state;
    if (!base || !importFacts) {
      return true;
    }
    const meta = toMeta(state, importFacts);
    try {
      if (base !== storedBase) {
        await api.extra.backup.replace(toMasterFile(base), meta, {
          changed: newlyChanged(null, changed, base.lastSavedAt),
          saved: newlyChanged(null, savedChanged, base.lastSavedAt),
        });
      } else {
        await api.extra.backup.update(meta, {
          changed: newlyChanged(storedChanged, changed, base.lastSavedAt),
          removed: noLongerChanged(storedChanged, changed),
          saved: newlyChanged(storedSaved, savedChanged, base.lastSavedAt),
        });
      }
      storedBase = base;
      storedChanged = changed;
      storedSaved = savedChanged;
      if (api.getState().master.hasPersistenceFailed) {
        api.dispatch(persistenceRecovered());
      }
      return true;
    } catch (error) {
      console.error('Writing the backup to browser storage failed:', error);
      // Storage may now hold anything (or nothing, if the browser deleted it): the next write starts over with
      // replace.
      storedBase = null;
      storedChanged = null;
      storedSaved = null;
      if (!api.getState().master.hasPersistenceFailed) {
        api.dispatch(persistenceFailed());
      }
      return false;
    }
  }

  listener.startListening({
    predicate: (action, current, previous) =>
      !restoreBackup.fulfilled.match(action) &&
      (current.master.base !== previous.master.base ||
        current.master.changed !== previous.master.changed ||
        current.master.savedChanged !== previous.master.savedChanged ||
        current.master.savedRevision !== previous.master.savedRevision),
    effect: async (_action, api) => {
      changes += 1;
      if (isWriting) {
        return;
      } // the running loop below will pick this change up
      isWriting = true;
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
          if (delay === undefined) {
            break;
          } // given up: the next change tries again
          failures += 1;
          await api.delay(delay);
          written = 0; // retry, including anything that changed meanwhile
        }
      } finally {
        isWriting = false;
      }
    },
  });
}
