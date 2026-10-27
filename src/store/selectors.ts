import { createSelector } from "@reduxjs/toolkit";
import {
  accountOf,
  actionStats,
  buildSessionDiff,
  summarizeSession,
  createDict,
  queryMatches,
  relationshipStats,
  reviewScopeStats,
  reviewStatusMatches,
  scopeMatches,
  tagMatches,
  type Account,
  type ActionStats,
  type DeepReadonly,
  type ReadonlyAccount,
  type ReadonlyAccounts,
  type Master,
  type ScopeStats,
} from "../core/index.ts";
import { CHANGE_VIEWS } from "./filtersSlice.ts";
import type { RootState } from "./index.ts";

// Everything handed to components is DeepReadonly: state is frozen, so writes must be compile errors.
type RAccount = ReadonlyAccount;
type RAccounts = ReadonlyAccounts;

// Per-edit work below only looks at the edited accounts (`changed`); anything that needs
// all accounts is computed once per import from `base`, which edits never touch.

const EMPTY_ACCOUNTS: RAccounts = Object.freeze(createDict<Account>());
const EMPTY_KEYS: readonly string[] = Object.freeze([]);
const EMPTY_TAGS: readonly string[] = Object.freeze([]);

export const selectBase = (s: RootState): DeepReadonly<Master> | null => s.master.base;
export const selectChanged = (s: RootState): RAccounts => s.master.changed;
export const selectHasProject = (s: RootState): boolean => s.master.base !== null;
export const selectIsDirty = (s: RootState): boolean => s.master.base !== null && s.master.revision !== s.master.savedRevision;
export const selectAccount = (s: RootState, key: string): RAccount | undefined =>
  s.master.base ? accountOf<RAccount>(s.master.base.accounts, s.master.changed, key) : undefined;
export const selectTagOptions = (s: RootState): readonly string[] => s.master.base?.tagOptions ?? EMPTY_TAGS;
export const selectFilters = (s: RootState) => s.filters;
const selectBaseAccounts = (s: RootState): RAccounts => s.master.base?.accounts ?? EMPTY_ACCOUNTS;

/** All account keys sorted by username. Once per import: edits never change usernames. */
export const selectSortedKeys = createSelector([selectBaseAccounts], (accounts): readonly string[] =>
  accounts === EMPTY_ACCOUNTS
    ? EMPTY_KEYS
    : Object.entries(accounts).sort(([, a], [, b]) => a.username.localeCompare(b.username)).map(([key]) => key),
);

/** Who follows whom. Once per import: edits never change relationships. */
export const selectRelationshipStats = createSelector([selectBaseAccounts], accounts => relationshipStats({ accounts }));

const selectScope = (s: RootState) => s.filters.scope;
const selectTag = (s: RootState) => s.filters.tag;
const selectBaseScopeStats = createSelector([selectBaseAccounts, selectScope, selectTag], (accounts, scope, tag) =>
  reviewScopeStats({ accounts }, { scope, tag }),
);

/** Review counts for the selected scope + tag: imported counts, adjusted by the edited accounts. */
export const selectScopeStats = createSelector(
  [selectBaseScopeStats, selectBaseAccounts, selectChanged, selectScope, selectTag],
  (baseStats, base, changed, scope, tag): ScopeStats => {
    const stats = { ...baseStats };
    const count = (account: RAccount | undefined, sign: 1 | -1) => {
      if (!account || !scopeMatches(account, scope) || !tagMatches(account, tag)) return;
      stats.total += sign;
      if (account.review.reviewed) stats.reviewed += sign;
      if (account.review.unavailable) stats.unavailable += sign;
    };
    for (const [key, account] of Object.entries(changed)) {
      count(base[key], -1);
      count(account, 1);
    }
    stats.needsReview = stats.total - stats.reviewed;
    return stats;
  },
);

const selectBaseActionStats = createSelector([selectBaseAccounts], accounts => actionStats({ accounts }));

/** Pending/confirmed action counts: imported counts, adjusted by the edited accounts. */
export const selectActionStats = createSelector([selectBaseActionStats, selectBaseAccounts, selectChanged], (baseStats, base, changed): ActionStats => {
  const stats: ActionStats = { pending: { ...baseStats.pending }, confirmed: { ...baseStats.confirmed } };
  for (const [key, account] of Object.entries(changed)) {
    const before = base[key];
    for (const [list, sign] of [[before?.actions, -1], [account.actions, 1]] as const) {
      if (!list) continue;
      for (const type of list.pending) stats.pending[type] += sign;
      for (const type of list.confirmed) stats.confirmed[type] += sign;
    }
  }
  return stats;
});

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

/**
 * Account keys to render, in username order. Filtering is one pass over the pre-sorted
 * keys; the previous array is returned when nothing changed, so typing a note doesn't
 * re-render the list.
 */
export const selectVisibleAccountKeys = createSelector(
  [selectSortedKeys, selectBaseAccounts, selectChanged, selectFilters],
  (keys, base, changed, filters): readonly string[] =>
    keys.filter(key => {
      const account = accountOf(base, changed, key);
      return !!account &&
        (filters.changeView === CHANGE_VIEWS.CURRENT ? scopeMatches(account, filters.scope) : account.followerChange === filters.changeView) &&
        reviewStatusMatches(account, filters.reviewStatus) &&
        tagMatches(account, filters.tag) &&
        queryMatches(account, filters.query);
    }),
  { memoizeOptions: { resultEqualityCheck: sameKeys } },
);

/** Net changes since import. Only edited accounts can differ, so only they are compared. */
export const selectSessionDiff = createSelector([selectBaseAccounts, selectChanged], (base, changed) => {
  const before = createDict<RAccount>();
  for (const key of Object.keys(changed)) {
    const account = base[key];
    if (account) before[key] = account;
  }
  return buildSessionDiff(before, changed);
});

export const selectSessionSummary = createSelector([selectSessionDiff], summarizeSession);
