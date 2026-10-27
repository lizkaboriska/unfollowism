import type { ListenerMiddlewareInstance } from "@reduxjs/toolkit";
import type { StoredSession } from "../io/sessionStore.ts";
import type { StoreDeps } from "./deps.ts";
import { persistenceFailed } from "./masterSlice.ts";
import type { MasterState } from "./masterSlice.ts";
import type { AppDispatch, RootState } from "./index.ts";

export function toStoredSession(state: MasterState, storedAt: string): StoredSession | null {
  if (!state.master || !state.baseline) return null;
  return {
    master: state.master,
    baseline: state.baseline,
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

/** Debounced autosave of the working state whenever the master slice changes. */
export function startPersistence(listener: ListenerMiddlewareInstance<RootState, AppDispatch, StoreDeps>, debounceMs: number): void {
  listener.startListening({
    predicate: (_action, current, previous) =>
      current.master.master !== previous.master.master ||
      current.master.savedRevision !== previous.master.savedRevision ||
      current.master.pendingSnapshot !== previous.master.pendingSnapshot,
    effect: async (_action, api) => {
      api.cancelActiveListeners();
      await api.delay(debounceMs);
      await persistNow(api.getState(), api.extra, api.dispatch);
    },
  });
}
