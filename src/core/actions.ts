import type { Account, Action, ActionType, DeepReadonly, Master, Snapshot } from "./types.ts";
import { usernameKey } from "./util.ts";

type ReadonlyActions = { readonly actions: readonly DeepReadonly<Action>[] };

export function actionId(source: ReadonlyActions, type: string, username: string, markedAt: string | null): string {
  const safeTime = (markedAt || "unknown").replace(/[^0-9A-Za-z]+/g, "").slice(0, 24) || "unknown";
  const safeUser = usernameKey(username).replace(/[^0-9a-z._-]+/g, "_").slice(0, 40) || "account";
  const base = `action_${type}_${safeUser}_${safeTime}`;
  const ids = new Set(source.actions.map(action => action.action_id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}_${suffix}`)) suffix += 1;
  return `${base}_${suffix}`;
}

/** Generic so reducers get a mutable action back and selectors a readonly one. */
export function pendingAction<A extends DeepReadonly<Action>>(source: { readonly actions: readonly A[] }, username: string, type: ActionType): A | null {
  const key = usernameKey(username);
  return source.actions.find(action => action.type === type && action.status === "pending" && usernameKey(action.username) === key) ?? null;
}

/** Why an action can't be marked right now, or null when it can. */
export function actionIneligibility(account: DeepReadonly<Account>, type: ActionType): string | null {
  if (type === "unfollow" && !account.current.you_follow) return "Cannot mark unfollow: this snapshot says you do not follow the account.";
  if (type === "remove_follower" && !account.current.follows_you) return "Cannot mark follower removal: this snapshot says the account does not follow you.";
  return null;
}

/** WRITE: idempotent — returns the existing pending action if there is one. Throws if the relationship doesn't allow the action. */
export function addPendingAction(
  source: Pick<Master, "actions">,
  account: Account,
  type: ActionType,
  markedAt: string | null,
  { skipEligibility = false }: { skipEligibility?: boolean } = {},
): Action {
  const existing = pendingAction(source, account.username, type);
  if (existing) return existing;

  if (!skipEligibility) {
    const reason = actionIneligibility(account, type);
    if (reason) throw new Error(reason);
  }

  const action: Action = {
    action_id: actionId(source, type, account.username, markedAt),
    username: account.username,
    type,
    status: "pending",
    marked_at: markedAt || null,
    confirmed_at: null,
    cancelled_at: null,
    confirmation_snapshot_id: null,
    confirmation_snapshot_date: null,
    relationship_at_mark: {
      you_follow: account.current.you_follow,
      follows_you: account.current.follows_you,
    },
  };
  source.actions.push(action);
  return action;
}

/** WRITE: marks the pending action cancelled (kept as history). Returns false if there was none. */
export function cancelPendingAction(source: Pick<Master, "actions">, username: string, type: ActionType, cancelledAt: string): boolean {
  const action = pendingAction(source, username, type);
  if (!action) return false;
  action.status = "cancelled";
  action.cancelled_at = cancelledAt || null;
  return true;
}

/** A date-only legacy snapshot must not invent an exact confirmation time. */
function confirmationIso(snapshot: DeepReadonly<Snapshot>, fallbackIso: string): string | null {
  if (snapshot.captured_at) return snapshot.captured_at;
  if (snapshot.snapshot_date) return null;
  return fallbackIso;
}

export interface ConfirmedCounts {
  unfollow: number;
  remove_follower: number;
  total: number;
}

/**
 * WRITE: a pending action is confirmed only when the snapshot's change set lists the
 * username AND the current relationship really is gone.
 */
export function confirmPendingActions(
  source: Pick<Master, "accounts" | "actions">,
  snapshot: DeepReadonly<Snapshot> | null,
  fallbackIso: string,
): ConfirmedCounts {
  const confirmed: ConfirmedCounts = { unfollow: 0, remove_follower: 0, total: 0 };
  if (!snapshot) return confirmed;

  const changes = snapshot.changes_from_previous_snapshot ?? {};
  const stoppedFollowing = new Set((changes.stopped_following ?? []).map(usernameKey));
  const lostFollowers = new Set((changes.lost_followers ?? []).map(usernameKey));

  for (const action of source.actions) {
    if (action.status !== "pending") continue;
    const key = usernameKey(action.username);
    const current = source.accounts[key]?.current;
    const matchesChange = action.type === "unfollow" ? stoppedFollowing.has(key) : lostFollowers.has(key);
    const relationshipGone = action.type === "unfollow" ? !current?.you_follow : !current?.follows_you;
    if (!matchesChange || !relationshipGone) continue;

    action.status = "confirmed";
    action.confirmed_at = confirmationIso(snapshot, fallbackIso);
    action.confirmation_snapshot_id = snapshot.snapshot_id || null;
    action.confirmation_snapshot_date = snapshot.snapshot_date || null;
    confirmed[action.type] += 1;
    confirmed.total += 1;
  }

  return confirmed;
}

export interface ActionStats {
  pendingUnfollow: number;
  pendingRemoveFollower: number;
  confirmedUnfollow: number;
  confirmedRemoveFollower: number;
}

export function actionStats(source: ReadonlyActions): ActionStats {
  const stats: ActionStats = { pendingUnfollow: 0, pendingRemoveFollower: 0, confirmedUnfollow: 0, confirmedRemoveFollower: 0 };
  for (const { type, status } of source.actions) {
    if (status === "pending") stats[type === "unfollow" ? "pendingUnfollow" : "pendingRemoveFollower"] += 1;
    if (status === "confirmed") stats[type === "unfollow" ? "confirmedUnfollow" : "confirmedRemoveFollower"] += 1;
  }
  return stats;
}

/** Latest confirmed action per username key and type, for history chips. */
export function latestConfirmedActions(source: ReadonlyActions): Map<string, Partial<Record<ActionType, DeepReadonly<Action>>>> {
  const index = new Map<string, Partial<Record<ActionType, DeepReadonly<Action>>>>();
  for (const action of source.actions) {
    if (action.status !== "confirmed") continue;
    const key = usernameKey(action.username);
    const entry = index.get(key) ?? {};
    entry[action.type] = action; // later entries win, matching the legacy reverse().find()
    index.set(key, entry);
  }
  return index;
}
