import { createSelector } from "@reduxjs/toolkit";
import {
  actionStats,
  buildSessionDiff,
  queryMatches,
  relationshipStats,
  reviewScopeStats,
  reviewStatusMatches,
  scopeMatches,
  tagMatches,
  type Account,
  type DeepReadonly,
  type Master,
} from "../core/index.ts";
import type { RootState } from "./index.ts";
import { CHANGE_VIEW_MARKER } from "./filtersSlice.ts";

// Everything handed to components is DeepReadonly: state is frozen, so writes must be compile errors.
type RAccount = DeepReadonly<Account>;

const EMPTY_ACCOUNTS: DeepReadonly<Record<string, Account>> = Object.freeze({});
const EMPTY_TAGS: readonly string[] = Object.freeze([]);

export const selectMaster = (s: RootState): DeepReadonly<Master> | null => s.master.master;
export const selectBaseline = (s: RootState): DeepReadonly<Master> | null => s.master.baseline;
export const selectHasProject = (s: RootState): boolean => s.master.master !== null;
export const selectIsDirty = (s: RootState): boolean => s.master.master !== null && s.master.revision !== s.master.savedRevision;
export const selectAccounts = (s: RootState): DeepReadonly<Record<string, Account>> => s.master.master?.accounts ?? EMPTY_ACCOUNTS;
export const selectAccount = (s: RootState, key: string): RAccount | undefined => s.master.master?.accounts[key];
export const selectTagOptions = (s: RootState): readonly string[] => s.master.master?.tag_options ?? EMPTY_TAGS;
export const selectFilters = (s: RootState) => s.filters;

export const selectRelationshipStats = createSelector([selectAccounts], accounts => relationshipStats({ accounts }));

export const selectScopeStats = createSelector(
  [selectAccounts, (s: RootState) => s.filters.scope, (s: RootState) => s.filters.tag],
  (accounts, scope, tag) => reviewScopeStats({ accounts }, { scope, tag }),
);

export const selectActionStats = createSelector([selectAccounts], accounts => actionStats({ accounts }));

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

/**
 * Account keys to render, sorted by username. Returns the previous array when the
 * result is unchanged, so typing a note doesn't re-render the list.
 */
export const selectVisibleAccountKeys = createSelector(
  [selectAccounts, selectFilters],
  (accounts, filters): readonly string[] =>
    Object.entries(accounts)
      .filter(([, account]) =>
        (filters.changeView === "current" ? scopeMatches(account, filters.scope) : account.follower_change === CHANGE_VIEW_MARKER[filters.changeView]) &&
        reviewStatusMatches(account, filters.reviewStatus) &&
        tagMatches(account, filters.tag) &&
        queryMatches(account, filters.query),
      )
      .sort(([, a], [, b]) => a.username.localeCompare(b.username))
      .map(([key]) => key),
  { memoizeOptions: { resultEqualityCheck: sameKeys } },
);

export const selectSessionDiff = createSelector([selectBaseline, selectMaster], (baseline, master) => buildSessionDiff(baseline, master));
