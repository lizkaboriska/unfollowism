import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  ImportError,
  MasterFormatError,
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

export function serializeMaster(master: Master, savedAt: string): string {
  return stringifyMasterFile(toMasterFile({ ...master, last_saved_at: savedAt }));
}

/** Downloads the master. Edits made while the download is in progress stay unsaved. */
export const saveMaster = createAppThunk<SaveFulfilled, undefined>(
  "master/save",
  async (_, { getState, extra, rejectWithValue }) => {
    const { master, revision } = getState().master;
    if (!master) return rejectWithValue("Nothing to save yet. Import your Instagram export first.");
    const now = extra.now();
    const savedAt = now.toISOString();
    const filename = masterFileName(now);
    await extra.download(filename, serializeMaster(master, savedAt));
    extra.lastSaved.set(savedAt);
    return { savedAt, revision, filename };
  },
  { condition: (_, { getState }) => getState().master.saveStatus !== "saving" },
);

export interface RestoredSession {
  master: Master;
  baseline: Master;
  revision: number;
  savedRevision: number;
  message: string;
}

/**
 * Rebuilds the working state from what this tab stored: the imported master (= baseline)
 * with the changed accounts applied on top. Everything goes through the strict readers.
 * Null if the stored data is unusable.
 */
export function reviveTab(stored: StoredTab): RestoredSession | null {
  try {
    const baseline = parseMaster(stored.base);
    const accounts = createDict<Account>();
    for (const [key, account] of Object.entries(baseline.accounts)) accounts[key] = account; // unchanged accounts are shared
    for (const [key, record] of Object.entries(stored.changed)) accounts[key] = fromAccountRecord(record, `changed.${key}`);
    const { meta } = stored;
    const master: Master = { ...baseline, accounts, tag_options: [...meta.tag_options] };
    if (meta.last_saved_at === undefined) delete master.last_saved_at;
    else master.last_saved_at = meta.last_saved_at;
    return {
      master,
      baseline,
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
