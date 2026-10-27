import type { ListenerMiddlewareInstance } from "@reduxjs/toolkit";
import { toMasterFile } from "../core/index.ts";
import type { StoredSession } from "../io/sessionStore.ts";
import type { StoreDeps } from "./deps.ts";
import { persistenceFailed } from "./masterSlice.ts";
import type { MasterState } from "./masterSlice.ts";
import type { AppDispatch, RootState } from "./index.ts";

export function toStoredSession(state: MasterState, storedAt: string): StoredSession | null {
  if (!state.master || !state.baseline) return null;
  return {
    master: toMasterFile(state.master),
    baseline: toMasterFile(state.baseline),
    revision: state.revision,
    savedRevision: state.savedRevision,
    pendingSnapshot: state.pendingSnapshot,
    message: state.message,
    storedAt,
  };
}

/** Writes the working state to browser storage now. Returns false if storage failed. */
export async function persistNow(state: RootState, deps: StoreDeps, dispatch: AppDispatch): Promise<boolean> {
  const session = toStoredSession(state.master, deps.now().toISOString());
  if (!session) return true;
  try {
    await deps.sessionStore.saveSession(session);
    return true;
  } catch {
    if (!state.master.persistenceFailed) dispatch(persistenceFailed());
    return false;
  }
}

/**
 * Saves the working state to browser storage on every change (a write takes ~2–4 ms).
 * If a change arrives while a write is in progress, one more write follows it with
 * the latest state, so writes never overlap and the last change is never skipped.
 */
export function startPersistence(listener: ListenerMiddlewareInstance<RootState, AppDispatch, StoreDeps>): void {
  let changes = 0; // bumped on every change
  let writing = false;

  listener.startListening({
    predicate: (_action, current, previous) =>
      current.master.master !== previous.master.master ||
      current.master.savedRevision !== previous.master.savedRevision ||
      current.master.pendingSnapshot !== previous.master.pendingSnapshot,
    effect: async (_action, api) => {
      changes += 1;
      if (writing) return; // the running loop below will pick this change up
      writing = true;
      try {
        let written = 0;
        while (written < changes) {
          written = changes;
          await persistNow(api.getState(), api.extra, api.dispatch);
        }
      } finally {
        writing = false;
      }
    },
  });
}
