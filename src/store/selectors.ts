import { createSelector } from "@reduxjs/toolkit";
import {
  actionStats,
  buildSessionDiff,
  latestConfirmedActions,
  queryMatches,
  relationshipStats,
  reviewScopeStats,
  reviewStatusMatches,
  scopeMatches,
  tagMatches,
  usernameKey,
  type Account,
  type Action,
  type ActionType,
  type DeepReadonly,
  type Master,
  type Snapshot,
} from "../core/index.ts";
import type { RootState } from "./index.ts";

// Everything handed to components is DeepReadonly: state is frozen, so writes must be compile errors.
type RAccount = DeepReadonly<Account>;
type RAction = DeepReadonly<Action>;

const EMPTY_ACCOUNTS: DeepReadonly<Record<string, Account>> = Object.freeze({});
const EMPTY_ACTIONS: readonly RAction[] = Object.freeze([]);
const EMPTY_TAGS: readonly string[] = Object.freeze([]);

export const selectMaster = (s: RootState): DeepReadonly<Master> | null => s.master.master;
export const selectBaseline = (s: RootState): DeepReadonly<Master> | null => s.master.baseline;
export const selectHasProject = (s: RootState): boolean => s.master.master !== null;
export const selectIsDirty = (s: RootState): boolean => s.master.master !== null && s.master.revision !== s.master.savedRevision;
export const selectAccounts = (s: RootState): DeepReadonly<Record<string, Account>> => s.master.master?.accounts ?? EMPTY_ACCOUNTS;
export const selectAccount = (s: RootState, key: string): RAccount | undefined => s.master.master?.accounts[key];
export const selectActions = (s: RootState): readonly RAction[] => s.master.master?.actions ?? EMPTY_ACTIONS;
export const selectTagOptions = (s: RootState): readonly string[] => s.master.master?.tag_options ?? EMPTY_TAGS;
export const selectFilters = (s: RootState) => s.filters;

export const selectLatestSnapshot = (s: RootState): DeepReadonly<Snapshot> | null => s.master.master?.snapshots.at(-1) ?? null;

export const selectRelationshipStats = createSelector([selectAccounts], accounts => relationshipStats({ accounts }));

export const selectScopeStats = createSelector(
  [selectAccounts, (s: RootState) => s.filters.scope, (s: RootState) => s.filters.tag],
  (accounts, scope, tag) => reviewScopeStats({ accounts }, { scope, tag }),
);

export const selectActionStats = createSelector([selectActions], actions => actionStats({ actions }));

/** Lower-cased usernames in the latest snapshot's change list for the active change tab; null on "current". */
export const selectChangedKeys = createSelector(
  [selectLatestSnapshot, (s: RootState) => s.filters.changeView],
  (snapshot, view): ReadonlySet<string> | null => {
    if (view === "current") return null;
    const changes = snapshot?.changes_from_previous_snapshot;
    const list = {
      followed_since: changes?.newly_following,
      unfollowed_since: changes?.stopped_following,
      new_followers: changes?.new_followers,
      new_unfollowers: changes?.lost_followers,
    }[view] ?? [];
    return new Set(list.map(usernameKey));
  },
);

function sameKeys(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((key, i) => key === b[i]);
}

/**
 * Account keys to render, sorted by username. Returns the previous array when the
 * result is unchanged, so typing a note doesn't re-render the list.
 */
export const selectVisibleAccountKeys = createSelector(
  [selectAccounts, selectFilters, selectChangedKeys],
  (accounts, filters, changedKeys): readonly string[] =>
    Object.entries(accounts)
      .filter(([key, account]) =>
        (changedKeys ? changedKeys.has(key) : scopeMatches(account, filters.scope)) &&
        reviewStatusMatches(account, filters.reviewStatus) &&
        tagMatches(account, filters.tag) &&
        queryMatches(account, filters.query),
      )
      .sort(([, a], [, b]) => a.username.localeCompare(b.username))
      .map(([key]) => key),
  { memoizeOptions: { resultEqualityCheck: sameKeys } },
);

export const selectSessionDiff = createSelector([selectBaseline, selectMaster], (baseline, master) => buildSessionDiff(baseline, master));

/** Pending action per account key and type. Unchanged actions keep their identity, so cards don't re-render. */
export const selectPendingIndex = createSelector([selectActions], actions => {
  const index = new Map<string, Partial<Record<ActionType, RAction>>>();
  for (const action of actions) {
    if (action.status !== "pending") continue;
    const key = usernameKey(action.username);
    const entry = index.get(key) ?? {};
    entry[action.type] ??= action; // first pending wins, like pendingAction()
    index.set(key, entry);
  }
  return index;
});

export const selectConfirmedIndex = createSelector([selectActions], actions => latestConfirmedActions({ actions }));
