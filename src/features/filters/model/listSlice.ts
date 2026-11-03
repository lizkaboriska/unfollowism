import { createSlice, type ListenerMiddlewareInstance, type PayloadAction } from '@reduxjs/toolkit';

import type { StoreDeps } from '@/app/store/deps.ts';
import type { AppDispatch, RootState } from '@/app/store/store.ts';
import { confirmRename, resetChanges } from '@/entities/master';

import { selectVisibleAccountKeys } from './selectors.ts';

/**
 * The account keys the list shows. Recomputed only when the tab or a filter changes, on
 * import/restore, after a reset and after a confirmed rename (the old account is gone), never on
 * an ordinary edit: a card you just ticked stays where it is, and typing a note doesn't refilter 100k accounts.
 */
export interface ListState {
  keys: readonly string[];
}

const initialState: ListState = { keys: [] };

export const listSlice = createSlice({
  name: 'list',
  initialState,
  reducers: {
    listRefreshed(_state, { payload }: PayloadAction<readonly string[]>) {
      return { keys: payload };
    },
  },
});

export const { listRefreshed } = listSlice.actions;

export const selectListKeys = (s: RootState): readonly string[] => s.list.keys;

export function startListRefresh(listener: ListenerMiddlewareInstance<RootState, AppDispatch, StoreDeps>): void {
  listener.startListening({
    predicate: (action, current, previous) =>
      current.filters !== previous.filters ||
      current.master.base !== previous.master.base ||
      resetChanges.match(action) ||
      confirmRename.match(action),
    effect: (_action, api) => {
      api.dispatch(listRefreshed(selectVisibleAccountKeys(api.getState())));
    },
  });
}
