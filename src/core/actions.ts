import { ACTION_TYPES, type Account, type AccountActions, type ActionType, type DeepReadonly, type Master, type Snapshot } from "./types.ts";
import { usernameKey } from "./util.ts";

type ReadonlyAccount = DeepReadonly<Account>;

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
  if (type === "unfollow" && !account.current.you_follow) return "Cannot mark unfollow: the latest export says you do not follow this account.";
  if (type === "remove_follower" && !account.current.follows_you) return "Cannot mark follower removal: the latest export says this account does not follow you.";
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

export type ActionCounts = Record<ActionType, number> & { total: number };

/**
 * WRITE: a pending action is confirmed only when the snapshot's change set lists the
 * username AND the current relationship really is gone.
 */
export function confirmPendingActions(source: Pick<Master, "accounts">, snapshot: DeepReadonly<Snapshot> | null): ActionCounts {
  const confirmed: ActionCounts = { unfollow: 0, remove_follower: 0, total: 0 };
  const changes = snapshot?.changes;
  if (!changes) return confirmed;

  const changed: Record<ActionType, ReadonlySet<string>> = {
    unfollow: new Set(changes.stopped_following.map(usernameKey)),
    remove_follower: new Set(changes.lost_followers.map(usernameKey)),
  };

  for (const [key, account] of Object.entries(source.accounts)) {
    for (const type of ACTION_TYPES) {
      if (!isPending(account, type) || !changed[type].has(key)) continue;
      const relationshipGone = type === "unfollow" ? !account.current.you_follow : !account.current.follows_you;
      if (!relationshipGone) continue;
      cancelPending(account, type);
      if (!isConfirmed(account, type)) account.actions.confirmed.push(type);
      confirmed[type] += 1;
      confirmed.total += 1;
    }
  }

  return confirmed;
}

export interface ActionStats {
  pending: ActionCounts;
  confirmed: ActionCounts;
}

export function actionStats(source: DeepReadonly<Pick<Master, "accounts">>): ActionStats {
  const stats: ActionStats = {
    pending: { unfollow: 0, remove_follower: 0, total: 0 },
    confirmed: { unfollow: 0, remove_follower: 0, total: 0 },
  };
  for (const { actions } of Object.values(source.accounts)) {
    for (const type of actions.pending) {
      stats.pending[type] += 1;
      stats.pending.total += 1;
    }
    for (const type of actions.confirmed) {
      stats.confirmed[type] += 1;
      stats.confirmed.total += 1;
    }
  }
  return stats;
}
