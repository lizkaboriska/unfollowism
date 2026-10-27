import { ACTION_TYPES, type Account, type AccountActions, type ActionType, type DeepReadonly, type Master, type ReadonlyAccount } from "./types.ts";

export function createActions(): AccountActions {
  return { pending: [], confirmed: [] };
}

export function isPending(account: ReadonlyAccount, type: ActionType): boolean {
  return account.actions.pending.includes(type);
}

export function isConfirmed(account: ReadonlyAccount, type: ActionType): boolean {
  return account.actions.confirmed.includes(type);
}

/** Why an action can't be marked right now, or null when it can. */
export function actionIneligibility(account: ReadonlyAccount, type: ActionType): string | null {
  if (type === ACTION_TYPES.UNFOLLOW && !account.following) return "Cannot mark unfollow: the latest export says you do not follow this account.";
  if (type === ACTION_TYPES.REMOVE_FOLLOWER && !account.followedBy) return "Cannot mark follower removal: the latest export says this account does not follow you.";
  return null;
}

/** WRITE: idempotent. Throws if the current relationship doesn't allow the action. */
export function markPending(account: Account, type: ActionType): void {
  const reason = actionIneligibility(account, type);
  if (reason) throw new Error(reason);
  if (!isPending(account, type)) account.actions.pending.push(type);
}

/** WRITE: returns false if the action wasn't pending. */
export function cancelPending(account: Account, type: ActionType): boolean {
  const index = account.actions.pending.indexOf(type);
  if (index === -1) return false;
  account.actions.pending.splice(index, 1);
  return true;
}

export type ActionCounts = Record<ActionType, number>;

export function emptyActionCounts(): ActionCounts {
  return { [ACTION_TYPES.UNFOLLOW]: 0, [ACTION_TYPES.REMOVE_FOLLOWER]: 0 };
}

export function totalOf(counts: Readonly<ActionCounts>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

/** Lower-cased usernames whose follow disappeared in an import. */
export interface FollowLosses {
  /** You no longer follow them. */
  stoppedFollowing: ReadonlySet<string>;
  /** They no longer follow you. */
  lostFollowers: ReadonlySet<string>;
}

/**
 * WRITE: a pending action is confirmed only when the import lost that follow AND the
 * current relationship really is gone.
 */
export function confirmPendingActions(source: Pick<Master, "accounts">, losses: FollowLosses): ActionCounts {
  const confirmed = emptyActionCounts();
  const lost: Record<ActionType, ReadonlySet<string>> = {
    [ACTION_TYPES.UNFOLLOW]: losses.stoppedFollowing,
    [ACTION_TYPES.REMOVE_FOLLOWER]: losses.lostFollowers,
  };

  for (const [key, account] of Object.entries(source.accounts)) {
    for (const type of Object.values(ACTION_TYPES)) {
      if (!isPending(account, type) || !lost[type].has(key)) continue;
      const relationshipGone = type === ACTION_TYPES.UNFOLLOW ? !account.following : !account.followedBy;
      if (!relationshipGone) continue;
      cancelPending(account, type);
      if (!isConfirmed(account, type)) account.actions.confirmed.push(type);
      confirmed[type] += 1;
    }
  }

  return confirmed;
}

export interface ActionStats {
  pending: ActionCounts;
  confirmed: ActionCounts;
}

export function actionStats(source: DeepReadonly<Pick<Master, "accounts">>): ActionStats {
  const stats: ActionStats = { pending: emptyActionCounts(), confirmed: emptyActionCounts() };
  for (const { actions } of Object.values(source.accounts)) {
    for (const type of actions.pending) stats.pending[type] += 1;
    for (const type of actions.confirmed) stats.confirmed[type] += 1;
  }
  return stats;
}
