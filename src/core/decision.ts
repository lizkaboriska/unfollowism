import {
  ACTION_TYPES,
  DecisionFilter,
  DecisionKind,
  type Account,
  type ActionType,
  type DeepReadonly,
  type Follow,
  type PlanState,
  type Plans,
  type ReadonlyAccount,
} from './types.ts';

/** The follow the action ends (you follow them / they follow you), as of the latest export; null when there is none. */
export function followOf(account: ReadonlyAccount, type: ActionType): DeepReadonly<Follow> | null {
  return type === ACTION_TYPES.UNFOLLOW ? account.following : account.followedBy;
}

/** Whether the follow the action ends still exists. A new plan needs it. */
export function followExists(account: ReadonlyAccount, type: ActionType): boolean {
  return followOf(account, type) !== null;
}

/**
 * A past account: in neither list of the latest export (you don't follow each other any more, or it was deactivated).
 * There is nothing left to decide, so it has no decision and can't get one.
 */
export function isPastAccount(account: ReadonlyAccount): boolean {
  return account.following === null && account.followedBy === null;
}

/** The plan for an action, or undefined when it isn't queued. */
export function planOf(account: ReadonlyAccount, type: ActionType): PlanState | undefined {
  return account.decision?.kind === DecisionKind.QUEUED ? account.decision.plans[type] : undefined;
}

/** Whether the account is Kept. */
export function isKept(account: ReadonlyAccount): boolean {
  return account.decision?.kind === DecisionKind.KEPT;
}

/** WRITE: Keep (no change in Instagram). Clears any plans. */
export function keep(account: Account): void {
  account.decision = { kind: DecisionKind.KEPT };
}

/** WRITE: back to Needs a decision. */
export function undecide(account: Account): void {
  delete account.decision;
}

/**
 * WRITE: sets one plan (planned → done after doing it by hand), or removes it with `undefined`. Queuing turns Kept
 * into queued; removing the last plan leaves the account needing a decision. A new plan needs its follow to exist;
 * throws otherwise (a caller bug).
 */
export function setPlan(account: Account, type: ActionType, state: PlanState | undefined): void {
  const current = account.decision?.kind === DecisionKind.QUEUED ? account.decision.plans : {};
  if (state !== undefined && current[type] === undefined && !followExists(account, type)) {
    throw new Error(`setPlan: no follow for ${type}`);
  }
  const plans: Plans = {};
  for (const t of Object.values(ACTION_TYPES)) {
    const plan = t === type ? state : current[t];
    if (plan !== undefined) {
      plans[t] = plan;
    }
  }
  if (Object.keys(plans).length > 0) {
    account.decision = { kind: DecisionKind.QUEUED, plans };
  } else if (account.decision?.kind === DecisionKind.QUEUED) {
    undecide(account);
  }
}

/** Past accounts match only Any: they don't need a decision, and any old one is gone. */
export function decisionMatches(account: ReadonlyAccount, filter: DecisionFilter): boolean {
  if (filter !== DecisionFilter.ANY && isPastAccount(account)) {
    return false;
  }
  switch (filter) {
    case DecisionFilter.ANY:
      return true;
    case DecisionFilter.NEEDS_DECISION:
      return account.decision === undefined;
    case DecisionFilter.KEPT:
      return account.decision?.kind === DecisionKind.KEPT;
    case DecisionFilter.QUEUED:
      return account.decision?.kind === DecisionKind.QUEUED;
  }
}
