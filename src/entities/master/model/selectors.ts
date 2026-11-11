import { createSelector } from '@reduxjs/toolkit';

import type { RootState } from '@/app/store/store.ts';
import { createDict } from '@/shared/lib/createDict.ts';
import type { DeepReadonly } from '@/shared/lib/deepReadonly.ts';

import { accountOf, type ChangedAccounts } from '../lib/account.ts';
import { countPlans, planStats, type PlanStats } from '../lib/actions.ts';
import { sameAccountData } from '../lib/masterFile.ts';
import { renameHiddenKeys, renamePairs, suggestedRenames, type RenamePair } from '../lib/renames.ts';
import { followChangeMatches, relationshipStats, scopeMatches, type FollowChangeCounts } from '../lib/scopes.ts';
import { buildSessionDiff } from '../lib/sessionDiff.ts';
import { countTags, tagCounts, tagsInUse, type TagCounts } from '../lib/tags.ts';
import {
  FOLLOW_CHANGES,
  PLAN_STATES,
  REVIEW_SCOPES,
  type Account,
  type ActionType,
  type FollowChange,
  type ReadonlyAccount,
  type ReadonlyAccounts,
  type ReviewScope,
} from '../lib/types.ts';

import { UNSAVED_IMPORT } from './masterSlice.ts';
import { SAVE_STATUSES } from './statuses.ts';
import { LIST_VIEWS, PLAN_VIEW_ACTIONS, TODO_VIEWS, type PlanView } from './views.ts';

// Everything handed to components is DeepReadonly: state is frozen, so writes must be compile errors.
/** Edited accounts; null = removed (see ChangedAccounts). */
type RChanged = DeepReadonly<ChangedAccounts>;

// Per-edit work below only looks at the edited accounts (`changed`); anything that needs
// all accounts is computed once per import from `base`, which edits never touch.

const EMPTY_ACCOUNTS: ReadonlyAccounts = Object.freeze(createDict<Account>());
const EMPTY_KEYS: readonly string[] = Object.freeze([]);

export function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

export const selectChanged = (s: RootState): RChanged => s.master.changed;
const selectSavedChanged = (s: RootState): RChanged => s.master.savedChanged;
/** Data is open: imported, or restored from the backup after a reload. */
export const selectHasData = (state: RootState): boolean => state.master.base !== null;
export const selectAccount = (s: RootState, key: string): ReadonlyAccount | undefined =>
  s.master.base ? accountOf<ReadonlyAccount>(s.master.base.accounts, s.master.changed, key) : undefined;
export const selectBaseAccounts = (s: RootState): ReadonlyAccounts => s.master.base?.accounts ?? EMPTY_ACCOUNTS;

/** For listeners: new data was loaded (an import, or a restore after a reload) between these two states. */
export function hasNewData(current: RootState, previous: RootState): boolean {
  return current.master.base !== previous.master.base;
}

/** For listeners: an account changed between these two states (new data, or an edit). */
export function hasAccountChanges(current: RootState, previous: RootState): boolean {
  return hasNewData(current, previous) || current.master.changed !== previous.master.changed;
}

/** Finds an account by key: the imported one, or its edited version (undefined once removed). */
export type AccountLookup = (key: string) => ReadonlyAccount | undefined;

/** A lookup for the current accounts; a new one only after an import or an edit. */
export const selectAccountLookup = createSelector(
  [selectBaseAccounts, selectChanged],
  (base, changed): AccountLookup =>
    key =>
      accountOf<ReadonlyAccount>(base, changed, key),
);

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

/** When the open data was imported; null before any import. */
export const selectImportedAt = (state: RootState): string | null => state.master.base?.lastImportAt ?? null;

/** A progress file is being written. */
export const selectIsSaving = (state: RootState): boolean => state.master.saveStatus === SAVE_STATUSES.SAVING;

/** A progress file was saved, or added, for this data. */
export const selectHasBeenSaved = (state: RootState): boolean => state.master.savedAt !== null;

/** The account's plan of this type was marked done before the import (so the import confirms it). */
export const selectWasPlanDoneBeforeImport = (state: RootState, key: string, type: ActionType): boolean =>
  !!state.master.importFacts?.completedPlans[key]?.includes(type);

/** The username as imported; still there for an account removed since (the old name of a moved rename). */
export const selectImportedUsername = (state: RootState, key: string): string | undefined =>
  state.master.base?.accounts[key]?.username;

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

/** Old accounts with a rename suggestion from the import. Once per import. */
const selectSuggestedRenames = createSelector([selectBaseAccounts], accounts => suggestedRenames(accounts));

/** The import's rename suggestions and where each stands now (Changes, Possible renames). */
export const selectRenamePairs = createSelector(
  [selectBaseAccounts, selectChanged, selectSuggestedRenames],
  (base, changed, fromKeys): readonly RenamePair[] => renamePairs(base, changed, fromKeys),
);

/**
 * The Changes page's sections now. Edits never change follows, so an edit can only take an account out: a removed
 * account (a confirmed rename) leaves its lists. Renames have their own section: both names are left out while
 * waiting, and the new name once moved (see renameHiddenKeys). Only the listed accounts are checked again.
 */
export const selectChangeSections = createSelector(
  [selectBaseChangeSections, selectChanged, selectChangesSince, selectRenamePairs],
  (sections, changed, since, pairs): ChangeSections => {
    const hidden = renameHiddenKeys(pairs);
    return byChange(change =>
      sections[change].filter(key => {
        if (hidden.has(key)) {
          return false;
        }
        if (!Object.hasOwn(changed, key)) {
          return true;
        }
        const account = changed[key];
        return !!account && followChangeMatches(account, change, since);
      }),
    );
  },
);

/** Sizes of the change lists. */
export const selectFollowChangeCounts = createSelector([selectChangeSections], (sections): FollowChangeCounts =>
  byChange(change => sections[change].length),
);

/** Everything on the Changes page: the listed accounts, and each rename pair as one change. */
export const selectChangesTotal = createSelector(
  [selectFollowChangeCounts, selectRenamePairs],
  (counts, pairs): number => Object.values(counts).reduce((sum, n) => sum + n, 0) + pairs.length,
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

/** Accounts per list (scope), ignoring any filters: imported counts, adjusted by edited and removed accounts. */
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
