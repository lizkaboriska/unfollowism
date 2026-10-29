import { createAsyncThunk } from '@reduxjs/toolkit';
import {
  ImportError,
  accountOf,
  createDict,
  fromAccountRecord,
  importExport,
  parseMaster,
  stringifyMasterFile,
  toMasterFile,
  type Account,
  type ChangedAccounts,
  type ImportProblem,
  type ImportResult,
  type Master,
} from '../core/index.ts';
import type { PreparedImport } from '../io/analyzeImport.ts';
import { masterFileName } from '../io/download.ts';
import { nextPaint } from '../io/nextPaint.ts';
import type { StoredTab } from '../io/tabStore.ts';
import type { StoreDeps } from './deps.ts';
import { SAVE_STATUSES } from './statuses.ts';
import type { AppDispatch, RootState } from './index.ts';

const createAppThunk = createAsyncThunk.withTypes<{ state: RootState; dispatch: AppDispatch; extra: StoreDeps }>();

/**
 * Applies an analyzed import (see io/analyzeImport) to the store. Rejects with the problem when the files can't be
 * imported.
 */
export const importPrepared = createAppThunk<ImportResult, PreparedImport, { rejectValue: ImportProblem }>(
  'master/import',
  async (prepared, { extra, rejectWithValue }) => {
    await nextPaint(); // let "Importing…" show before the merge, which can take seconds for large accounts
    try {
      return importExport(prepared.rawMaster, prepared.bundle, extra.now().toISOString());
    } catch (error) {
      if (error instanceof ImportError) return rejectWithValue(error.problem);
      throw error;
    }
  },
);

export interface SaveFulfilled {
  savedAt: string;
  revision: number;
  filename: string;
  /** The edited accounts as written to the file (null = removed, so not in the file). */
  changed: ChangedAccounts;
}

/** The full master: imported accounts with the edited ones applied, without removed ones. */
export function currentMaster(base: Master, changed: Readonly<ChangedAccounts>): Master {
  const accounts = createDict<Account>();
  for (const key of Object.keys(base.accounts)) {
    const account = accountOf(base.accounts, changed, key);
    if (account) accounts[key] = account;
  }
  return { ...base, accounts };
}

export function serializeMaster(master: Master, savedAt: string): string {
  return stringifyMasterFile(toMasterFile({ ...master, lastSavedAt: savedAt }));
}

/**
 * Downloads the master. Edits made while the download is in progress stay unsaved.
 * Skipped (like a second save while one runs) when nothing is loaded; the Save button is disabled then.
 */
export const saveMaster = createAppThunk<SaveFulfilled, undefined>(
  'master/save',
  async (_, { getState, extra }) => {
    const { base, changed, revision } = getState().master;
    if (!base) throw new Error('saveMaster: nothing loaded'); // unreachable: see condition
    const master = currentMaster(base, changed);
    const now = extra.now();
    const savedAt = now.toISOString();
    const filename = masterFileName(now);
    await extra.download(filename, serializeMaster(master, savedAt));
    extra.lastSaved.set(savedAt);
    return { savedAt, revision, filename, changed };
  },
  {
    condition: (_, { getState }) =>
      getState().master.base !== null && getState().master.saveStatus !== SAVE_STATUSES.SAVING,
  },
);

export interface RestoredSession {
  base: Master;
  changed: ChangedAccounts;
  savedChanged: ChangedAccounts;
  savedAt: string | null;
  revision: number;
  savedRevision: number;
}

/** null records are accounts removed since the import (see ChangedAccounts). */
function reviveAccounts(records: Record<string, unknown>, path: string): ChangedAccounts {
  const accounts = createDict<Account | null>();
  for (const [key, record] of Object.entries(records))
    accounts[key] = record === null ? null : fromAccountRecord(record, `${path}.${key}`);
  return accounts;
}

/**
 * Reads back what this tab stored: the imported master and the accounts changed since
 * (current versions, and versions as in the last downloaded file).
 * Everything goes through the strict readers, which throw if the stored data is unusable.
 */
function reviveTab(stored: StoredTab): RestoredSession {
  const base = parseMaster(stored.base);
  const changed = reviveAccounts(stored.changed, 'changed');
  const savedChanged = reviveAccounts(stored.saved, 'saved');
  const { meta } = stored;
  return {
    base,
    changed,
    savedChanged,
    savedAt: meta.lastSavedAt ?? base.lastSavedAt ?? null,
    revision: meta.revision,
    savedRevision: meta.savedRevision,
  };
}

/**
 * After a reload: puts back whatever this tab was working on. Null for a new tab (nothing stored);
 * rejected when something is stored but can't be read back (see MasterState.restoreFailed).
 */
export const restoreTab = createAppThunk<RestoredSession | null, undefined>(
  'master/restoreTab',
  async (_, { extra }) => {
    const stored = await extra.tab.load();
    return stored ? reviveTab(stored) : null;
  },
);
