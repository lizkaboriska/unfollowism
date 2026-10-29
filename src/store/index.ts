import {
  combineReducers,
  configureStore,
  createListenerMiddleware,
  type ThunkDispatch,
  type UnknownAction,
} from '@reduxjs/toolkit';
import type { StoreDeps } from './deps.ts';
import { filtersSlice } from './filtersSlice.ts';
import { listSlice, startListRefresh } from './listSlice.ts';
import { masterSlice } from './masterSlice.ts';
import { startPersistence } from './persistence.ts';
import { startTagFilterCleanup } from './tagFilterCleanup.ts';

export const rootReducer = combineReducers({
  master: masterSlice.reducer,
  filters: filtersSlice.reducer,
  list: listSlice.reducer,
});

export type RootState = ReturnType<typeof rootReducer>;
// Declared directly (not via ReturnType<typeof makeStore>) because the listener middleware needs it before the store
// exists.
export type AppDispatch = ThunkDispatch<RootState, StoreDeps, UnknownAction>;

export function makeStore(deps: StoreDeps) {
  const listener = createListenerMiddleware<RootState, AppDispatch, StoreDeps>({ extra: deps });
  const store = configureStore({
    reducer: rootReducer,
    middleware: getDefaultMiddleware =>
      getDefaultMiddleware({
        thunk: { extraArgument: deps },
        // Development-only checks. They walk the whole state on every action, which at
        // 100k accounts costs ~100 ms per keystroke. Not needed here: Immer freezes the
        // state (so accidental mutation throws), and the master is plain JSON from parseMaster.
        immutableCheck: false,
        serializableCheck: false,
      }).prepend(listener.middleware),
  });
  startPersistence(listener);
  startTagFilterCleanup(listener);
  startListRefresh(listener);
  return store;
}

export type AppStore = ReturnType<typeof makeStore>;
