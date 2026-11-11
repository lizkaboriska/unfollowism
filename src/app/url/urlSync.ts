import { createAction, isAnyOf, type ListenerMiddlewareInstance } from '@reduxjs/toolkit';

import type { StoreDeps } from '@/app/store/deps.ts';
import type { AppDispatch, RootState } from '@/app/store/store.ts';
import { selectHasData, restoreBackup } from '@/entities/master';
import { selectTodoStartView, setView, showUrlFilters, LIST_VIEWS } from '@/features/filters';
import type { AddressBar } from '@/shared/url/addressBar.ts';

import { filtersFromUrl, filtersToUrl } from './urlState.ts';

/** Back or Forward showed another step of this page's history (dispatched by the app, see AddressBar). */
export const addressChanged = createAction('url/addressChanged');

/**
 * Keeps the page and Review's filters in the URL, so a reload shows the same screen and Back goes to the last page:
 * - the URL is read once, when the store is made;
 * - when the backed-up work is restored, the store takes the URL's page and filters (plain /todo opens the tab
 *   selectTodoStartView picks), and the URL is rewritten in full, dropping anything it didn't understand;
 * - with no work to restore, Welcome shows and the URL goes back to "/";
 * - from then on, a page change adds a Back step and a filter change rewrites the current one;
 * - Back or Forward shows that step's page; on Review also its filters. Other pages keep Review's filters as they are.
 */
export function startUrlSync(
  listener: ListenerMiddlewareInstance<RootState, AppDispatch, StoreDeps>,
  address: AddressBar,
): void {
  const start = address.read();
  let startUsed = false;
  let restored = false;
  /** True while the store takes a page from the URL: the URL only gets corrected, with no new Back step. */
  let fromAddress = false;

  function show(filters: RootState['filters'], newStep: boolean): void {
    const url = filtersToUrl(filters);
    const { pathname, search } = address.read();
    if (pathname + search === url) {
      return;
    }
    if (newStep) {
      address.push(url);
    } else {
      address.replace(url);
    }
  }

  function takeFromAddress(apply: () => void): void {
    fromAddress = true;
    try {
      apply();
    } finally {
      fromAddress = false;
    }
  }

  listener.startListening({
    matcher: isAnyOf(restoreBackup.fulfilled, restoreBackup.rejected),
    effect: (action, api) => {
      if (startUsed) {
        return; // a second restore (React's development double run) leaves the screen alone
      }
      startUsed = true;
      restored = true;
      if (restoreBackup.fulfilled.match(action) && action.payload) {
        const asked = filtersFromUrl(start.pathname, start.search);
        takeFromAddress(() => {
          api.dispatch(showUrlFilters({ ...asked, view: asked.view ?? selectTodoStartView(api.getState()) }));
        });
      }
      show(api.getState().filters, false);
    },
  });

  listener.startListening({
    actionCreator: addressChanged,
    effect: (_action, api) => {
      if (!restored || !selectHasData(api.getState())) {
        return; // Welcome stays until there is work to show
      }
      const { pathname, search } = address.read();
      const asked = filtersFromUrl(pathname, search);
      takeFromAddress(() => {
        if (asked.view === LIST_VIEWS.REVIEW) {
          api.dispatch(showUrlFilters({ ...asked, view: LIST_VIEWS.REVIEW }));
        } else {
          api.dispatch(setView(asked.view ?? selectTodoStartView(api.getState())));
        }
      });
      show(api.getState().filters, false);
    },
  });

  listener.startListening({
    predicate: (_action, current, previous) => restored && current.filters !== previous.filters,
    effect: (_action, api) => {
      const { filters } = api.getState();
      show(filters, !fromAddress && filters.view !== api.getOriginalState().filters.view);
    },
  });
}
