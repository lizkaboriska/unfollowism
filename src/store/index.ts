import { combineReducers, configureStore, createListenerMiddleware, type ThunkDispatch, type UnknownAction } from "@reduxjs/toolkit";
import type { StoreDeps } from "./deps.ts";
import { filtersSlice } from "./filtersSlice.ts";
import { masterSlice } from "./masterSlice.ts";
import { startPersistence } from "./persistence.ts";

export const rootReducer = combineReducers({
  master: masterSlice.reducer,
  filters: filtersSlice.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;
// Declared directly (not via ReturnType<typeof makeStore>) because the listener middleware needs it before the store exists.
export type AppDispatch = ThunkDispatch<RootState, StoreDeps, UnknownAction>;

// The master is ~0.5 MB; walking it on every action in dev is too slow, and it is
// plain JSON validated by parseMaster anyway.
const LARGE_STATE_PATHS = ["master.master", "master.baseline"];
const LARGE_ACTION_PATHS = ["payload.result.master", "payload.master", "payload.baseline", "meta.arg"];

export interface StoreOptions {
  persistDebounceMs?: number;
  preloadedState?: Partial<RootState>;
}

export function makeStore(deps: StoreDeps, { persistDebounceMs = 500, preloadedState }: StoreOptions = {}) {
  const listener = createListenerMiddleware<RootState, AppDispatch, StoreDeps>({ extra: deps });
  const store = configureStore({
    reducer: rootReducer,
    ...(preloadedState ? { preloadedState } : {}),
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        thunk: { extraArgument: deps },
        immutableCheck: { ignoredPaths: LARGE_STATE_PATHS },
        serializableCheck: { ignoredPaths: LARGE_STATE_PATHS, ignoredActionPaths: LARGE_ACTION_PATHS },
      }).prepend(listener.middleware),
  });
  startPersistence(listener, persistDebounceMs);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
