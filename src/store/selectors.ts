import { createSelector } from "@reduxjs/toolkit";
import {
  ACTION_TYPES,
  PLAN_STATES,
  accountOf,
  buildSessionDiff,
  countPlans,
  followChangeCounts,
  followChangeMatches,
  planOf,
  planStats,
  summarizeSession,
  createDict,
  queryMatches,
  relationshipStats,
  reviewScopeStats,
  reviewStatusMatches,
  sameAccountRecord,
  scopeMatches,
  tagMatches,
  type Account,
  type ActionType,
  type DeepReadonly,
  type FollowChangeCounts,
  type PlanStats,
  type ReadonlyAccount,
  type ReadonlyAccounts,
  type Master,
  type ScopeStats,
} from "../core/index.ts";
import { LIST_VIEWS, isFollowChangeView, isPlanView, type FiltersState } from "./filtersSlice.ts";
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
const selectSavedChanged = (s: RootState): RAccounts => s.master.savedChanged;
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

const selectBasePlanStats = createSelector([selectBaseAccounts], accounts => planStats({ accounts }));

/** Planned/done action counts: imported counts, adjusted by the edited accounts. */
export const selectPlanStats = createSelector([selectBasePlanStats, selectBaseAccounts, selectChanged], (baseStats, base, changed): PlanStats => {
  const stats: PlanStats = { [PLAN_STATES.PLANNED]: { ...baseStats.planned }, [PLAN_STATES.DONE]: { ...baseStats.done } };
  for (const [key, account] of Object.entries(changed)) {
    const before = base[key];
    if (before) countPlans(stats, before, -1);
    countPlans(stats, account, 1);
  }
  return stats;
});

/** When the imported master was saved: "new" and "unfollowed" lists count from here. Null = no saved master yet. */
export const selectChangesSince = (s: RootState): string | null => s.master.base?.lastSavedAt ?? null;

/** Sizes of the change lists. Once per import: edits never change follows. */
export const selectFollowChangeCounts = createSelector([selectBaseAccounts, selectChangesSince], (accounts, since): FollowChangeCounts =>
  followChangeCounts({ accounts }, since),
);

const PLAN_VIEW_ACTIONS: Partial<Record<FiltersState["view"], ActionType>> = {
  [LIST_VIEWS.TO_UNFOLLOW]: ACTION_TYPES.UNFOLLOW,
  [LIST_VIEWS.TO_REMOVE]: ACTION_TYPES.REMOVE_FOLLOWER,
};

/** Whether the account belongs to the selected view (before status, tag and search filters). */
function viewMatches(account: RAccount, filters: FiltersState, since: string | null): boolean {
  if (filters.view === LIST_VIEWS.REVIEW) return scopeMatches(account, filters.scope);
  if (isFollowChangeView(filters.view)) return followChangeMatches(account, filters.view, since);
  const action = PLAN_VIEW_ACTIONS[filters.view];
  return action !== undefined && planOf(account, action) === PLAN_STATES.PLANNED;
}

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

/**
 * Account keys matching the tab and filters, in username order: one pass over the
 * pre-sorted keys. The list shown on screen is a snapshot of this taken by the list slice
 * (listSlice.ts), which decides when to recompute it.
 */
export const selectVisibleAccountKeys = createSelector(
  [selectSortedKeys, selectBaseAccounts, selectChanged, selectFilters, selectChangesSince],
  (keys, base, changed, filters, since): readonly string[] =>
    keys.filter(key => {
      const account = accountOf(base, changed, key);
      return !!account &&
        viewMatches(account, filters, since) &&
        (isPlanView(filters.view) || reviewStatusMatches(account, filters.reviewStatus)) &&
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

/** Per current account object: the saved version it was compared with, and whether they match. */
const savedComparisons = new WeakMap<RAccount, { saved: RAccount | undefined; same: boolean }>();

function sameAsSaved(current: RAccount | undefined, saved: RAccount | undefined): boolean {
  if (current === saved) return true;
  if (!current || !saved) return false;
  const cached = savedComparisons.get(current);
  if (cached?.saved === saved) return cached.same;
  const same = sameAccountRecord(current, saved);
  savedComparisons.set(current, { saved, same });
  return same;
}

/**
 * How many accounts differ from the last downloaded file (or from the import, if not
 * saved since): what Reset changes would undo. Only edited accounts can differ; each
 * edited account is compared once, not on every edit.
 */
export const selectUnsavedAccountCount = createSelector([selectBaseAccounts, selectChanged, selectSavedChanged], (base, changed, saved) => {
  if (changed === saved) return 0;
  let count = 0;
  for (const key of new Set([...Object.keys(changed), ...Object.keys(saved)])) {
    if (!sameAsSaved(accountOf(base, changed, key), accountOf(base, saved, key))) count += 1;
  }
  return count;
});
