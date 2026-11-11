import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/app/store/store.ts';
import {
  PLAN_STATES,
  planOf,
  decisionMatches,
  queryMatches,
  scopeMatches,
  tagMatches,
  type ReadonlyAccount,
  sameKeys,
  selectAccountLookup,
  selectSortedKeys,
  selectTodoStartAction,
} from '@/entities/master';

import type { FiltersState } from './filtersSlice.ts';
import { LIST_VIEWS, PLAN_VIEW_ACTIONS, ACTION_PLAN_VIEWS, isPlanView, type PlanView } from './views.ts';

export const selectFilters = (s: RootState) => s.filters;

/** The To do tab to open: the one of the action selectTodoStartAction picks. */
export const selectTodoStartView = (state: RootState): PlanView => ACTION_PLAN_VIEWS[selectTodoStartAction(state)];

/**
 * Whether the account is listed with these filters. Review: its list (scope), decision, tag and search. Changes
 * shows its own sections (selectChangeSections). A To do tab lists every account with its plan, queued or done,
 * whatever Review's filters: it has no search or filters of its own that could explain a hidden row.
 */
function accountVisible(account: ReadonlyAccount, filters: FiltersState): boolean {
  if (filters.view === LIST_VIEWS.REVIEW) {
    return (
      scopeMatches(account, filters.scope) &&
      decisionMatches(account, filters.decision) &&
      tagMatches(account, filters.tag) &&
      queryMatches(account, filters.query)
    );
  }
  if (filters.view === LIST_VIEWS.CHANGES) {
    return false;
  }
  return planOf(account, PLAN_VIEW_ACTIONS[filters.view]) !== undefined;
}

/**
 * Account keys matching the tab and filters, in username order: one pass over the pre-sorted keys. In a To do tab
 * the queued plans come first and the done ones after them. The list shown on screen is a snapshot of this taken by
 * the list slice (listSlice.ts), which decides when to recompute it.
 */
export const selectVisibleAccountKeys = createSelector(
  [selectSortedKeys, selectAccountLookup, selectFilters],
  (keys, accountByKey, filters): readonly string[] => {
    const visible = keys.filter(key => {
      const account = accountByKey(key);
      return !!account && accountVisible(account, filters);
    });
    if (!isPlanView(filters.view)) {
      return visible;
    }
    const type = PLAN_VIEW_ACTIONS[filters.view];
    const isDone = (key: string) => {
      const account = accountByKey(key);
      return !!account && planOf(account, type) === PLAN_STATES.DONE;
    };
    return [...visible.filter(key => !isDone(key)), ...visible.filter(isDone)];
  },
  { memoizeOptions: { resultEqualityCheck: sameKeys } },
);

/** How many accounts other filters would list (the Filter popup's "Show N accounts"), as of now. */
export function selectMatchingCount(state: RootState, filters: FiltersState): number {
  const accountByKey = selectAccountLookup(state);
  let count = 0;
  for (const key of selectSortedKeys(state)) {
    const account = accountByKey(key);
    if (account && accountVisible(account, filters)) {
      count += 1;
    }
  }
  return count;
}
