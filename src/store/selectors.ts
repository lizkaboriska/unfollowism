import { createSelector } from "@reduxjs/toolkit";
import {
  FOLLOW_CHANGES,
  PLAN_STATES,
  accountOf,
  buildSessionDiff,
  countPlans,
  countTags,
  followChangeCounts,
  followChangeMatches,
  planOf,
  planStats,
  summarizeSession,
  tagCounts,
  tagsInUse,
  createDict,
  queryMatches,
  relationshipStats,
  reviewScopeStats,
  reviewStatusMatches,
  sameAccountData,
  scopeMatches,
  tagMatches,
  type Account,
  type ChangedAccounts,
  type DeepReadonly,
  type FollowChangeCounts,
  type PlanStats,
  type ReadonlyAccount,
  type ReadonlyAccounts,
  type ScopeStats,
  type TagCounts,
} from "../core/index.ts";
import { LIST_VIEWS, PLAN_VIEW_ACTIONS, isFollowChangeView, isPlanView, type FiltersState } from "./filtersSlice.ts";
import { UNSAVED_IMPORT } from "./masterSlice.ts";
import type { RootState } from "./index.ts";

// Everything handed to components is DeepReadonly: state is frozen, so writes must be compile errors.
/** Edited accounts; null = removed (see ChangedAccounts). */
type RChanged = DeepReadonly<ChangedAccounts>;

// Per-edit work below only looks at the edited accounts (`changed`); anything that needs
// all accounts is computed once per import from `base`, which edits never touch.

const EMPTY_ACCOUNTS: ReadonlyAccounts = Object.freeze(createDict<Account>());
const EMPTY_KEYS: readonly string[] = Object.freeze([]);

export const selectChanged = (s: RootState): RChanged => s.master.changed;
const selectSavedChanged = (s: RootState): RChanged => s.master.savedChanged;
export const selectHasProject = (s: RootState): boolean => s.master.base !== null;
export const selectAccount = (s: RootState, key: string): ReadonlyAccount | undefined =>
  s.master.base ? accountOf<ReadonlyAccount>(s.master.base.accounts, s.master.changed, key) : undefined;
export const selectFilters = (s: RootState) => s.filters;
const selectBaseAccounts = (s: RootState): ReadonlyAccounts => s.master.base?.accounts ?? EMPTY_ACCOUNTS;

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
    const count = (account: ReadonlyAccount | undefined, sign: 1 | -1) => {
      if (!account || !scopeMatches(account, scope) || !tagMatches(account, tag)) return;
      stats.total += sign;
      if (account.review.reviewed) stats.reviewed += sign;
      if (account.review.unavailable) stats.unavailable += sign;
    };
    for (const [key, account] of Object.entries(changed)) {
      count(base[key], -1);
      count(account ?? undefined, 1);
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
    if (account) countPlans(stats, account, 1);
  }
  return stats;
});

/** When the imported master was saved: "new" and "unfollowed" lists count from here. Null = no saved master yet. */
export const selectChangesSince = (s: RootState): string | null => s.master.base?.lastSavedAt ?? null;

const selectBaseFollowChangeCounts = createSelector([selectBaseAccounts, selectChangesSince], (accounts, since): FollowChangeCounts =>
  followChangeCounts({ accounts }, since),
);

/**
 * Sizes of the change lists: imported counts, adjusted by the edited accounts. Edits never change
 * follows, but a removed account leaves its lists, and deciding a rename takes it out of Lost followers.
 */
export const selectFollowChangeCounts = createSelector(
  [selectBaseFollowChangeCounts, selectBaseAccounts, selectChanged, selectChangesSince],
  (baseCounts, base, changed, since): FollowChangeCounts => {
    const counts = { ...baseCounts };
    for (const [key, account] of Object.entries(changed)) {
      for (const change of Object.values(FOLLOW_CHANGES)) {
        const before = base[key];
        if (before && followChangeMatches(before, change, since)) counts[change] -= 1;
        if (account && followChangeMatches(account, change, since)) counts[change] += 1;
      }
    }
    return counts;
  },
);

/** Whether the account belongs to the selected view (before status, tag and search filters). */
function viewMatches(account: ReadonlyAccount, filters: FiltersState, since: string | null): boolean {
  if (filters.view === LIST_VIEWS.REVIEW) return scopeMatches(account, filters.scope);
  if (isFollowChangeView(filters.view)) return followChangeMatches(account, filters.view, since);
  return planOf(account, PLAN_VIEW_ACTIONS[filters.view]) === PLAN_STATES.PLANNED;
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

/**
 * Net changes not in the downloaded file yet: each edited account as last saved (or as
 * imported, if not saved since) against now. Only edited accounts can differ, so only they are compared.
 */
export const selectUnsavedDiff = createSelector([selectBaseAccounts, selectChanged, selectSavedChanged], (base, changed, saved) => {
  const before = createDict<ReadonlyAccount>();
  const after = createDict<ReadonlyAccount>();
  for (const key of new Set([...Object.keys(changed), ...Object.keys(saved)])) {
    const then = accountOf(base, saved, key);
    const now = accountOf(base, changed, key);
    if (then === now) continue; // untouched since the save
    if (then) before[key] = then;
    if (now) after[key] = now;
  }
  return buildSessionDiff(before, after);
});

export const selectUnsavedSummary = createSelector([selectUnsavedDiff], summarizeSession);

/** Per current account object: the saved version it was compared with, and whether they match. */
const savedComparisons = new WeakMap<ReadonlyAccount, { saved: ReadonlyAccount | undefined; same: boolean }>();

function sameAsSaved(current: ReadonlyAccount | undefined, saved: ReadonlyAccount | undefined): boolean {
  if (current === saved) return true;
  if (!current || !saved) return false;
  const cached = savedComparisons.get(current);
  if (cached?.saved === saved) return cached.same;
  const same = sameAccountData(current, saved);
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

/**
 * Whether there is anything not in the downloaded file yet: an import that differs from its file,
 * or an account that differs from it. An edit that was undone (a tag ticked on and off) doesn't count.
 */
export const selectIsDirty = (s: RootState): boolean =>
  s.master.base !== null && (s.master.savedRevision === UNSAVED_IMPORT || selectUnsavedAccountCount(s) > 0);

const selectBaseTagCounts = createSelector([selectBaseAccounts], accounts => tagCounts({ accounts }));

/** How many accounts have each tag: imported counts, adjusted by the edited accounts. */
export const selectTagCounts = createSelector([selectBaseTagCounts, selectBaseAccounts, selectChanged], (baseCounts, base, changed): Readonly<TagCounts> => {
  const counts: TagCounts = Object.assign(createDict<number>(), baseCounts);
  for (const [key, account] of Object.entries(changed)) {
    const before = base[key];
    if (before) countTags(counts, before, -1);
    if (account) countTags(counts, account, 1);
  }
  return counts;
});

/** Every tag some account has, alphabetical. The previous array is kept while the names don't change. */
export const selectTags = createSelector([selectTagCounts], (counts): readonly string[] => tagsInUse(counts), {
  memoizeOptions: { resultEqualityCheck: sameKeys },
});
