import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  ImportError,
  MasterFormatError,
  accountOf,
  createDict,
  fromAccountRecord,
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
import { nextPaint } from "../io/nextPaint.ts";
import type { StoredTab } from "../io/tabStore.ts";
import type { StoreDeps } from "./deps.ts";
import { SAVE_STATUSES } from "./statuses.ts";
import type { AppDispatch, RootState } from "./index.ts";

const createAppThunk = createAsyncThunk.withTypes<{ state: RootState; dispatch: AppDispatch; extra: StoreDeps; rejectValue: string }>();

/** Applies an analyzed import (see io/analyzeImport) to the store. */
export const importPrepared = createAppThunk<ImportResult, PreparedImport>("master/import", async (prepared, { extra, rejectWithValue }) => {
  await nextPaint(); // let "Importing…" show before the merge, which can take seconds for large accounts
  try {
    return importExport(prepared.rawMaster, prepared.bundle, extra.now().toISOString());
  } catch (error) {
    if (error instanceof ImportError || error instanceof MasterFormatError) return rejectWithValue(error.message);
    throw error;
  }
});

export interface SaveFulfilled {
  savedAt: string;
  revision: number;
  filename: string;
  /** The edited accounts as written to the file. */
  changed: Record<string, Account>;
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
    return { savedAt, revision, filename, changed };
  },
  { condition: (_, { getState }) => getState().master.saveStatus !== SAVE_STATUSES.SAVING },
);

export interface RestoredSession {
  base: Master;
  changed: Record<string, Account>;
  savedChanged: Record<string, Account>;
  savedAt: string | null;
  revision: number;
  savedRevision: number;
}

function reviveAccounts(records: Record<string, unknown>, path: string): Record<string, Account> {
  const accounts = createDict<Account>();
  for (const [key, record] of Object.entries(records)) accounts[key] = fromAccountRecord(record, `${path}.${key}`);
  return accounts;
}

/**
 * Reads back what this tab stored: the imported master and the accounts changed since
 * (current versions, and versions as in the last downloaded file).
 * Everything goes through the strict readers. Null if the stored data is unusable.
 */
export function reviveTab(stored: StoredTab): RestoredSession | null {
  try {
    const base = parseMaster(stored.base);
    const changed = reviveAccounts(stored.changed, "changed");
    const savedChanged = reviveAccounts(stored.saved, "saved");
    const { meta } = stored;
    return {
      base,
      changed,
      savedChanged,
      savedAt: meta.lastSavedAt ?? base.lastSavedAt ?? null,
      revision: meta.revision,
      savedRevision: meta.savedRevision,
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
