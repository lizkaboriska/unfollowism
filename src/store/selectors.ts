import { createSelector } from '@reduxjs/toolkit';

import { createDict } from '@/shared/lib/createDict.ts';
import type { DeepReadonly } from '@/shared/lib/deepReadonly.ts';

import {
  FOLLOW_CHANGES,
  PLAN_STATES,
  REVIEW_SCOPES,
  accountOf,
  buildSessionDiff,
  countPlans,
  countTags,
  followChangeMatches,
  planOf,
  planStats,
  groupSessionChanges,
  tagCounts,
  tagsInUse,
  decisionMatches,
  queryMatches,
  relationshipStats,
  sameAccountData,
  scopeMatches,
  tagMatches,
  type Account,
  type ChangedAccounts,
  type FollowChange,
  type FollowChangeCounts,
  type PlanStats,
  type ReadonlyAccount,
  type ReadonlyAccounts,
  type ReviewScope,
  type TagCounts,
} from '../core/index.ts';

import {
  LIST_VIEWS,
  PLAN_VIEW_ACTIONS,
  TODO_VIEWS,
  isPlanView,
  type FiltersState,
  type PlanView,
} from './filtersSlice.ts';
import type { RootState } from './index.ts';
import { UNSAVED_IMPORT } from './masterSlice.ts';

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
    : Object.entries(accounts)
        .sort(([, a], [, b]) => a.username.localeCompare(b.username))
        .map(([key]) => key),
);

/** Who follows whom. Once per import: edits never change relationships. */
export const selectRelationshipStats = createSelector([selectBaseAccounts], accounts =>
  relationshipStats({ accounts }),
);

const selectBasePlanStats = createSelector([selectBaseAccounts], accounts => planStats({ accounts }));

/** Planned/done action counts: imported counts, adjusted by the edited accounts. */
export const selectPlanStats = createSelector(
  [selectBasePlanStats, selectBaseAccounts, selectChanged],
  (baseStats, base, changed): PlanStats => {
    const stats: PlanStats = {
      [PLAN_STATES.PLANNED]: { ...baseStats.planned },
      [PLAN_STATES.DONE]: { ...baseStats.done },
    };
    for (const [key, account] of Object.entries(changed)) {
      const before = base[key];
      if (before) {
        countPlans(stats, before, -1);
      }
      if (account) {
        countPlans(stats, account, 1);
      }
    }
    return stats;
  },
);

/**
 * The To do tab to open: the first with work left (Unfollow, then Remove follower), else the first with done plans to
 * look back at, else Unfollow.
 */
export function selectTodoStartView(s: RootState): PlanView {
  const stats = selectPlanStats(s);
  return (
    TODO_VIEWS.find(v => stats[PLAN_STATES.PLANNED][PLAN_VIEW_ACTIONS[v]] > 0) ??
    TODO_VIEWS.find(v => stats[PLAN_STATES.DONE][PLAN_VIEW_ACTIONS[v]] > 0) ??
    LIST_VIEWS.TO_UNFOLLOW
  );
}

/** When the imported master was saved: "new" and "unfollowed" lists count from here. Null = no saved master yet. */
export const selectChangesSince = (s: RootState): string | null => s.master.base?.lastSavedAt ?? null;

export type ChangeSections = Record<FollowChange, readonly string[]>;

/** One value per change list. */
function byChange<T>(make: (change: FollowChange) => T): Record<FollowChange, T> {
  return Object.fromEntries(Object.values(FOLLOW_CHANGES).map(change => [change, make(change)])) as Record<
    FollowChange,
    T
  >;
}

/** The Changes page's sections as imported: account keys in username order. Once per import. */
const selectBaseChangeSections = createSelector(
  [selectSortedKeys, selectBaseAccounts, selectChangesSince],
  (keys, accounts, since): ChangeSections =>
    byChange(change =>
      keys.filter(key => {
        const account = accounts[key];
        return !!account && followChangeMatches(account, change, since);
      }),
    ),
);

/**
 * The Changes page's sections now. Edits never change follows, so an edit can only take an account out: a removed
 * account (a confirmed rename) leaves its lists, and deciding a rename takes it out of No longer follow you. Only the
 * listed accounts are checked again, never all of them.
 */
export const selectChangeSections = createSelector(
  [selectBaseChangeSections, selectChanged, selectChangesSince],
  (sections, changed, since): ChangeSections =>
    byChange(change =>
      sections[change].filter(key => {
        if (!Object.hasOwn(changed, key)) {
          return true;
        }
        const account = changed[key];
        return !!account && followChangeMatches(account, change, since);
      }),
    ),
);

/** Sizes of the change lists. */
export const selectFollowChangeCounts = createSelector([selectChangeSections], (sections): FollowChangeCounts =>
  byChange(change => sections[change].length),
);

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

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
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

/**
 * Net changes not in the downloaded file yet: each edited account as last saved (or as
 * imported, if not saved since) against now. Only edited accounts can differ, so only they are compared.
 */
export const selectUnsavedDiff = createSelector(
  [selectBaseAccounts, selectChanged, selectSavedChanged],
  (base, changed, saved) => {
    const before = createDict<ReadonlyAccount>();
    const after = createDict<ReadonlyAccount>();
    for (const key of new Set([...Object.keys(changed), ...Object.keys(saved)])) {
      const then = accountOf(base, saved, key);
      const now = accountOf(base, changed, key);
      if (then === now) {
        continue;
      } // untouched since the save
      if (then) {
        before[key] = then;
      }
      if (now) {
        after[key] = now;
      }
    }
    return buildSessionDiff(before, after);
  },
);

/** The unsaved changes as the popup shows them: tag rows, then the other changes per account. */
export const selectUnsavedGroups = createSelector([selectUnsavedDiff], groupSessionChanges);

/** Per current account object: the saved version it was compared with, and whether they match. */
const savedComparisons = new WeakMap<ReadonlyAccount, { saved: ReadonlyAccount | undefined; same: boolean }>();

function sameAsSaved(current: ReadonlyAccount | undefined, saved: ReadonlyAccount | undefined): boolean {
  if (current === saved) {
    return true;
  }
  if (!current || !saved) {
    return false;
  }
  const cached = savedComparisons.get(current);
  if (cached?.saved === saved) {
    return cached.same;
  }
  const same = sameAccountData(current, saved);
  savedComparisons.set(current, { saved, same });
  return same;
}

/**
 * How many accounts differ from the last downloaded file (or from the import, if not
 * saved since): what Reset changes would undo. Only edited accounts can differ; each
 * edited account is compared once, not on every edit.
 */
export const selectUnsavedAccountCount = createSelector(
  [selectBaseAccounts, selectChanged, selectSavedChanged],
  (base, changed, saved) => {
    if (changed === saved) {
      return 0;
    }
    let count = 0;
    for (const key of new Set([...Object.keys(changed), ...Object.keys(saved)])) {
      if (!sameAsSaved(accountOf(base, changed, key), accountOf(base, saved, key))) {
        count += 1;
      }
    }
    return count;
  },
);

/**
 * Whether there is anything not in the downloaded file yet: an import that differs from its file,
 * or an account that differs from it. An edit that was undone (a tag ticked on and off) doesn't count.
 */
export const selectIsDirty = (s: RootState): boolean =>
  s.master.base !== null && (s.master.savedRevision === UNSAVED_IMPORT || selectUnsavedAccountCount(s) > 0);

const selectBaseTagCounts = createSelector([selectBaseAccounts], accounts => tagCounts({ accounts }));

/** How many accounts have each tag: imported counts, adjusted by the edited accounts. */
export const selectTagCounts = createSelector(
  [selectBaseTagCounts, selectBaseAccounts, selectChanged],
  (baseCounts, base, changed): Readonly<TagCounts> => {
    const counts: TagCounts = Object.assign(createDict<number>(), baseCounts);
    for (const [key, account] of Object.entries(changed)) {
      const before = base[key];
      if (before) {
        countTags(counts, before, -1);
      }
      if (account) {
        countTags(counts, account, 1);
      }
    }
    return counts;
  },
);

/** Every tag some account has, alphabetical. The previous array is kept while the names don't change. */
export const selectTags = createSelector([selectTagCounts], (counts): readonly string[] => tagsInUse(counts), {
  memoizeOptions: { resultEqualityCheck: sameKeys },
});
