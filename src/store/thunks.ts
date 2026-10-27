import { createAsyncThunk } from "@reduxjs/toolkit";
import {
  ImportError,
  MasterFormatError,
  SCHEMA_VERSION,
  STATUS_SEMANTICS,
  buildImportMessage,
  cloneJson,
  importExport,
  normalizeMaster,
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

export function prepareMasterForSave(master: Master, savedAt: string): Master {
  const out = cloneJson(master);
  out.schema_version = SCHEMA_VERSION;
  out.status_semantics = cloneJson(STATUS_SEMANTICS);
  out.exported_at = savedAt;
  out.last_updated_at = savedAt;
  out.last_saved_at = savedAt;
  return out;
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
    await extra.download(filename, `${JSON.stringify(prepareMasterForSave(master, savedAt), null, 2)}\n`);
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

/** Re-validates a stored draft through the single normalizeMaster entry point. Null if unusable. */
export function reviveSession(stored: StoredSession): RestoredSession | null {
  try {
    return {
      master: normalizeMaster(stored.master).next,
      baseline: normalizeMaster(stored.baseline).next,
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
