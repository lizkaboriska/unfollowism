import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  ImportError,
  MasterFormatError,
  buildImportMessage,
  importExport,
  parseMaster,
  stringifyMasterFile,
  toMasterFile,
  type ImportResult,
  type Master,
} from "../core/index.ts";
import type { PreparedImport } from "../io/analyzeImport.ts";
import { masterFileName } from "../io/download.ts";
import type { StoredSession } from "../io/sessionStore.ts";
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
    await extra.sessionStore.setLastSavedAt(savedAt).catch(() => undefined); // best effort
    return { savedAt, revision, filename };
  },
  { condition: (_, { getState }) => getState().master.saveStatus !== "saving" },
);

export interface RestoredSession {
  master: Master;
  baseline: Master;
  revision: number;
  savedRevision: number;
  pendingSnapshot: boolean;
  message: string;
  storedAt: string;
}

/** Re-validates a stored draft through the single parseMaster entry point. Null if unusable. */
export function reviveSession(stored: StoredSession): RestoredSession | null {
  try {
    return {
      master: parseMaster(stored.master),
      baseline: parseMaster(stored.baseline),
      revision: stored.revision,
      savedRevision: stored.savedRevision,
      pendingSnapshot: stored.pendingSnapshot,
      message: stored.message,
      storedAt: stored.storedAt,
    };
  } catch {
    return null;
  }
}

/** Reads the stored draft (if any) without applying it; the UI asks before resuming. */
export const loadStoredSession = createAppThunk<RestoredSession | null, undefined>("master/loadStored", async (_, { extra }) => {
  const stored = await extra.sessionStore.loadSession().catch(() => null);
  return stored ? reviveSession(stored) : null;
});
