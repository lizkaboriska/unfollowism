import { createSelector } from '@reduxjs/toolkit';

import {
  PLAN_STATES,
  REVIEW_SCOPES,
  accountOf,
  planOf,
  decisionMatches,
  queryMatches,
  scopeMatches,
  tagMatches,
  type ReadonlyAccount,
  type ReviewScope,
} from '@/entities/master/lib/index.ts';
import { sameKeys, selectBaseAccounts, selectChanged, selectSortedKeys } from '@/entities/master/model/selectors.ts';
import { LIST_VIEWS, PLAN_VIEW_ACTIONS, isPlanView } from '@/entities/master/model/views.ts';
import type { RootState } from '@/store/index.ts';

import { type FiltersState } from './filtersSlice.ts';

export const selectFilters = (s: RootState) => s.filters;

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
  [selectSortedKeys, selectBaseAccounts, selectChanged, selectFilters],
  (keys, base, changed, filters): readonly string[] => {
    const visible = keys.filter(key => {
      const account = accountOf(base, changed, key);
      return !!account && accountVisible(account, filters);
    });
    if (!isPlanView(filters.view)) {
      return visible;
    }
    const type = PLAN_VIEW_ACTIONS[filters.view];
    const isDone = (key: string) => {
      const account = accountOf(base, changed, key);
      return !!account && planOf(account, type) === PLAN_STATES.DONE;
    };
    return [...visible.filter(key => !isDone(key)), ...visible.filter(isDone)];
  },
  { memoizeOptions: { resultEqualityCheck: sameKeys } },
);

/** How many accounts other filters would list (the Filter sheet's "Show N accounts"), as of now. */
export function selectMatchingCount(s: RootState, filters: FiltersState): number {
  const base = selectBaseAccounts(s);
  const changed = selectChanged(s);
  let count = 0;
  for (const key of selectSortedKeys(s)) {
    const account = accountOf(base, changed, key);
    if (account && accountVisible(account, filters)) {
      count += 1;
    }
  }
  return count;
}

export type ScopeTotals = Record<ReviewScope, number>;

function countScopes(totals: ScopeTotals, account: ReadonlyAccount, sign: 1 | -1): void {
  for (const scope of Object.values(REVIEW_SCOPES)) {
    if (scopeMatches(account, scope)) {
      totals[scope] += sign;
    }
  }
}

const selectBaseScopeTotals = createSelector([selectBaseAccounts], (accounts): ScopeTotals => {
  const totals: ScopeTotals = {
    [REVIEW_SCOPES.FOLLOWING]: 0,
    [REVIEW_SCOPES.FOLLOWERS]: 0,
    [REVIEW_SCOPES.MUTUAL]: 0,
    [REVIEW_SCOPES.NOT_FOLLOWING_BACK]: 0,
    [REVIEW_SCOPES.FOLLOWS_YOU_ONLY]: 0,
    [REVIEW_SCOPES.ALL_CURRENT]: 0,
    [REVIEW_SCOPES.ALL_ACCOUNTS]: 0,
  };
  for (const account of Object.values(accounts)) {
    countScopes(totals, account, 1);
  }
  return totals;
});

/** Accounts per list (scope), ignoring the other filters: imported counts, adjusted by removed accounts. */
export const selectScopeTotals = createSelector(
  [selectBaseScopeTotals, selectBaseAccounts, selectChanged],
  (baseTotals, base, changed): ScopeTotals => {
    const totals = { ...baseTotals };
    for (const [key, account] of Object.entries(changed)) {
      const before = base[key];
      if (before) {
        countScopes(totals, before, -1);
      }
      if (account) {
        countScopes(totals, account, 1);
      }
    }
    return totals;
  },
);
