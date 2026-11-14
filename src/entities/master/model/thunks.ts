import { createAsyncThunk } from '@reduxjs/toolkit';

import type { StoreDeps } from '@/app/store/deps.ts';
import type { AppDispatch, RootState } from '@/app/store/store.ts';
import { createDict } from '@/shared/lib/createDict.ts';

import type { StoredBackup } from '../api/backupStore.ts';
import type { ChangedAccounts } from '../lib/account.ts';
import type { PreparedImport } from '../lib/analyzeImport.ts';
import { ImportError, type ImportProblem } from '../lib/importProblems.ts';
import {
  currentMaster,
  fromAccountRecord,
  parseBackupMeta,
  parseMaster,
  serializeMaster,
  toMasterFile,
  type MasterFile,
} from '../lib/masterFile.ts';
import { masterFileName } from '../lib/masterFileName.ts';
import { importExport, importIntoWork, type ImportResult, type WorkImportResult } from '../lib/merge.ts';
import { FORMAT_VERSION, type ImportFacts, type Account, type Master } from '../lib/types.ts';

import { SAVE_STATUSES } from './statuses.ts';

const createAppThunk = createAsyncThunk.withTypes<{ state: RootState; dispatch: AppDispatch; extra: StoreDeps }>();

/**
 * Applies an analyzed import (see lib/analyzeImport) to the store. Rejects with the problem when the files can't be
 * imported.
 */
export const importPrepared = createAppThunk<ImportResult, PreparedImport, { rejectValue: ImportProblem }>(
  'master/import',
  async (prepared, { extra, rejectWithValue }) => {
    await extra.nextPaint(); // let "Importing…" show before the merge, which can take seconds for large accounts
    try {
      return importExport(prepared.rawMaster, prepared.bundle, extra.now().toISOString());
    } catch (error) {
      if (error instanceof ImportError) {
        return rejectWithValue(error.problem);
      }
      throw error;
    }
  },
);

/** The work as a master file dated with the last save (`savedAt`), as a download writes it: no first-seen dates. */
function asMasterFile(base: Master, edits: ChangedAccounts, savedAt: string | null): MasterFile {
  const { accounts, lastImportAt } = currentMaster(base, edits);
  return toMasterFile({
    version: FORMAT_VERSION,
    accounts,
    lastImportAt,
    ...(savedAt === null ? {} : { lastSavedAt: savedAt }),
  });
}

/**
 * Applies an analyzed export that came without a master file to the work in the browser (see lib importIntoWork):
 * edits not saved yet stay unsaved on top of the new baseline. Only for loaded work and no chosen master; rejects with
 * the problem when the files can't be imported.
 */
export const importIntoBrowserWork = createAppThunk<WorkImportResult, PreparedImport, { rejectValue: ImportProblem }>(
  'master/importIntoWork',
  async (prepared, { getState, extra, rejectWithValue }) => {
    const { base, changed, savedChanged, savedAt } = getState().master;
    if (!base || prepared.rawMaster !== null) {
      throw new Error('importIntoBrowserWork: needs loaded work and no master file');
    } // unreachable: the Import screen offers it only then
    await extra.nextPaint(); // let "Importing…" show: this merges twice
    try {
      return importIntoWork(
        asMasterFile(base, savedChanged, savedAt),
        asMasterFile(base, changed, savedAt),
        prepared.bundle,
        extra.now().toISOString(),
      );
    } catch (error) {
      if (error instanceof ImportError) {
        return rejectWithValue(error.problem);
      }
      throw error;
    }
  },
);

export interface SaveFulfilled {
  savedAt: string;
  revision: number;
  /** The edited accounts as written to the file (null = removed, so not in the file). */
  changed: ChangedAccounts;
}

/**
 * Downloads the master. Edits made while the download is in progress stay unsaved.
 * Skipped (like a second save while one runs) when nothing is loaded; the Save button is disabled then.
 */
export const saveMaster = createAppThunk<SaveFulfilled, undefined>(
  'master/save',
  async (_, { getState, extra }) => {
    const { base, changed, revision } = getState().master;
    if (!base) {
      throw new Error('saveMaster: nothing loaded');
    } // unreachable: see condition
    const master = currentMaster(base, changed);
    const now = extra.now();
    const savedAt = now.toISOString();
    const filename = masterFileName(now);
    await extra.download(filename, serializeMaster(master, savedAt));
    extra.lastSaved.set(savedAt);
    return { savedAt, revision, changed };
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
  importFacts: ImportFacts;
  savedAt: string | null;
  revision: number;
  savedRevision: number;
}

/** null records are accounts removed since the import (see ChangedAccounts). */
function reviveAccounts(records: Record<string, unknown>, path: string): ChangedAccounts {
  const accounts = createDict<Account | null>();
  for (const [key, record] of Object.entries(records)) {
    accounts[key] = record === null ? null : fromAccountRecord(record, `${path}.${key}`);
  }
  return accounts;
}

/**
 * Reads back the browser backup: the imported master and the accounts changed since
 * (current versions, and versions as in the last downloaded file).
 * Everything goes through the strict readers, which throw if the stored data is unusable.
 */
function reviveTab(stored: StoredBackup): RestoredSession {
  const base = parseMaster(stored.base);
  const changed = reviveAccounts(stored.changed, 'changed');
  const savedChanged = reviveAccounts(stored.saved, 'saved');
  const meta = parseBackupMeta(stored.meta, 'meta');
  return {
    base,
    changed,
    savedChanged,
    importFacts: meta.importFacts,
    savedAt: meta.lastSavedAt ?? base.lastSavedAt ?? null,
    revision: meta.revision,
    savedRevision: meta.savedRevision,
  };
}

/**
 * On start: puts back the work in the browser backup. Null when nothing is stored;
 * rejected when something is stored but can't be read back (see MasterState.hasRestoreFailed).
 */
export const restoreBackup = createAppThunk<RestoredSession | null, undefined>(
  'master/restoreBackup',
  async (_, { extra }) => {
    const stored = await extra.backup.load();
    return stored ? reviveTab(stored) : null;
  },
);
