import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  ImportError,
  MasterFormatError,
  accountOf,
  createDict,
  fromAccountRecord,
  buildImportMessage,
  importExport,
  parseMaster,
  stringifyMasterFile,
  toMasterFile,
  type Account,
  type ImportResult,
  type Master,
} from "../core/index.ts";
import type { PreparedImport } from "../io/analyzeImport.ts";
import { masterFileName } from "../io/download.ts";
import type { StoredTab } from "../io/tabStore.ts";
import type { StoreDeps } from "./deps.ts";
import { SAVE_STATUSES } from "./statuses.ts";
import type { AppDispatch, RootState } from "./index.ts";

const createAppThunk = createAsyncThunk.withTypes<{ state: RootState; dispatch: AppDispatch; extra: StoreDeps; rejectValue: string }>();

export interface ImportFulfilled {
  result: ImportResult;
  message: string;
}

/** Applies an analyzed import (see io/analyzeImport) to the store. */
export const importPrepared = createAppThunk<ImportFulfilled, PreparedImport>("master/import", (prepared, { extra, rejectWithValue }) => {
  try {
    const result = importExport(prepared.rawMaster, prepared.bundle, extra.now().toISOString());
    return { result, message: buildImportMessage(result) };
  } catch (error) {
    if (error instanceof ImportError || error instanceof MasterFormatError) return rejectWithValue(error.message);
    throw error;
  }
});

export interface SaveFulfilled {
  savedAt: string;
  revision: number;
  filename: string;
}

/** The full master: imported accounts with the edited ones applied. */
export function currentMaster(base: Master, changed: Readonly<Record<string, Account>>): Master {
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

/** Downloads the master. Edits made while the download is in progress stay unsaved. */
export const saveMaster = createAppThunk<SaveFulfilled, undefined>(
  "master/save",
  async (_, { getState, extra, rejectWithValue }) => {
    const { base, changed, revision } = getState().master;
    if (!base) return rejectWithValue("Nothing to save yet. Import your Instagram export first.");
    const master = currentMaster(base, changed);
    const now = extra.now();
    const savedAt = now.toISOString();
    const filename = masterFileName(now);
    await extra.download(filename, serializeMaster(master, savedAt));
    extra.lastSaved.set(savedAt);
    return { savedAt, revision, filename };
  },
  { condition: (_, { getState }) => getState().master.saveStatus !== SAVE_STATUSES.SAVING },
);

export interface RestoredSession {
  base: Master;
  changed: Record<string, Account>;
  savedAt: string | null;
  revision: number;
  savedRevision: number;
  message: string;
}

/**
 * Reads back what this tab stored: the imported master and the accounts changed since.
 * Everything goes through the strict readers. Null if the stored data is unusable.
 */
export function reviveTab(stored: StoredTab): RestoredSession | null {
  try {
    const base = parseMaster(stored.base);
    const changed = createDict<Account>();
    for (const [key, record] of Object.entries(stored.changed)) changed[key] = fromAccountRecord(record, `changed.${key}`);
    const { meta } = stored;
    return {
      base,
      changed,
      savedAt: meta.lastSavedAt ?? base.lastSavedAt ?? null,
      revision: meta.revision,
      savedRevision: meta.savedRevision,
      message: meta.message,
    };
  } catch {
    return null;
  }
}

/** After a reload: puts back whatever this tab was working on (nothing if it's a new tab). */
export const restoreTab = createAppThunk<RestoredSession | null, undefined>("master/restoreTab", async (_, { extra }) => {
  const stored = await extra.tab.load().catch(() => null);
  return stored ? reviveTab(stored) : null;
});
