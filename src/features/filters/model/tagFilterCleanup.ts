import type { ListenerMiddlewareInstance } from '@reduxjs/toolkit';

import type { StoreDeps } from '@/app/store/deps.ts';
import type { AppDispatch, RootState } from '@/app/store/store.ts';
import { TAG_FILTER_KINDS, selectTagCounts } from '@/entities/master';

import { setTagFilter } from './filtersSlice.ts';

/**
 * Tags exist only while an account has them. When the filtered tag disappears (deleted,
 * removed from its last account, reset, or absent from a newly imported master), the
 * filter goes back to All tags instead of showing an empty list.
 */
export function startTagFilterCleanup(listener: ListenerMiddlewareInstance<RootState, AppDispatch, StoreDeps>): void {
  listener.startListening({
    predicate: (_action, current, previous) =>
      current.filters.tag.kind === TAG_FILTER_KINDS.TAG &&
      (current.master.base !== previous.master.base ||
        current.master.changed !== previous.master.changed ||
        current.filters.tag !== previous.filters.tag),
    effect: (_action, api) => {
      const { tag } = api.getState().filters;
      if (tag.kind === TAG_FILTER_KINDS.TAG && !selectTagCounts(api.getState())[tag.tag]) {
        api.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.ALL }));
      }
    },
  });
}
