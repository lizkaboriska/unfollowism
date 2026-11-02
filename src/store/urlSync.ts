import { isAnyOf, type ListenerMiddlewareInstance } from '@reduxjs/toolkit';

import type { AddressBar } from '../io/addressBar.ts';

import type { StoreDeps } from './deps.ts';
import { showUrlFilters, type FiltersState } from './filtersSlice.ts';
import type { AppDispatch, RootState } from './index.ts';
import { selectTodoStartView } from './selectors.ts';
import { restoreTab } from './thunks.ts';
import { filtersFromUrl, filtersToUrl, type UrlFilters } from './urlState.ts';

function show(address: AddressBar, filters: FiltersState): void {
  const url = filtersToUrl(filters);
  const { pathname, search } = address.read();
  if (pathname + search !== url) {
    address.replace(url);
  }
}

/**
 * Keeps the page and Review's filters in the URL, so a reload shows the same screen:
 * - the URL is read once, when the store is made;
 * - when this tab's work is restored, the store takes the URL's page and filters (plain /todo opens the tab
 *   selectTodoStartView picks), and the URL is rewritten in full, dropping anything it didn't understand;
 * - with no work to restore, Welcome shows and the URL goes back to "/";
 * - from then on, every page or filter change updates the URL.
 */
export function startUrlSync(
  listener: ListenerMiddlewareInstance<RootState, AppDispatch, StoreDeps>,
  address: AddressBar,
): void {
  const { pathname, search } = address.read();
  let fromUrl: UrlFilters | null = filtersFromUrl(pathname, search); // null once used
  let restored = false;

  listener.startListening({
    matcher: isAnyOf(restoreTab.fulfilled, restoreTab.rejected),
    effect: (action, api) => {
      if (!fromUrl) {
        return; // a second restore (React's development double run) leaves the screen alone
      }
      const asked = fromUrl;
      fromUrl = null;
      restored = true;
      if (restoreTab.fulfilled.match(action) && action.payload) {
        api.dispatch(showUrlFilters({ ...asked, view: asked.view ?? selectTodoStartView(api.getState()) }));
      }
      show(address, api.getState().filters);
    },
  });

  listener.startListening({
    predicate: (_action, current, previous) => restored && current.filters !== previous.filters,
    effect: (_action, api) => {
      show(address, api.getState().filters);
    },
  });
}
