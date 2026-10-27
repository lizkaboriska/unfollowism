import { ACTION_TYPES, PLAN_STATES, type Account, type ActionType, type DeepReadonly, type Master, type PlanState, type ReadonlyAccount } from "./types.ts";

/** The account field that holds each action's plan. */
export const PLAN_FIELDS = { [ACTION_TYPES.UNFOLLOW]: "toUnfollow", [ACTION_TYPES.REMOVE_FOLLOWER]: "toRemove" } as const satisfies Record<ActionType, keyof Account>;

/** The plan for an action, or undefined when it isn't marked. */
export function planOf(account: ReadonlyAccount, type: ActionType): PlanState | undefined {
  return account[PLAN_FIELDS[type]];
}

/** Whether the follow the action ends still exists. */
function followExists(account: ReadonlyAccount, type: ActionType): boolean {
  return type === ACTION_TYPES.UNFOLLOW ? account.following !== null : account.followedBy !== null;
}

/** Why an action can't be marked right now, or null when it can. */
export function actionIneligibility(account: ReadonlyAccount, type: ActionType): string | null {
  if (type === ACTION_TYPES.UNFOLLOW && !account.following) return "Cannot mark unfollow: the latest export says you do not follow this account.";
  if (type === ACTION_TYPES.REMOVE_FOLLOWER && !account.followedBy) return "Cannot mark follower removal: the latest export says this account does not follow you.";
  return null;
}

/** WRITE: sets the plan (undefined = not marked). Planning requires the follow to exist; throws otherwise. */
export function setPlan(account: Account, type: ActionType, state: PlanState | undefined): void {
  const field = PLAN_FIELDS[type];
  if (state === undefined) {
    if (type === ACTION_TYPES.UNFOLLOW) delete account.toUnfollow;
    else delete account.toRemove;
    return;
  }
  if (account[field] === undefined) {
    const reason = actionIneligibility(account, type);
    if (reason) throw new Error(reason);
  }
  account[field] = state;
}

export type ActionCounts = Record<ActionType, number>;

export function emptyActionCounts(): ActionCounts {
  return { [ACTION_TYPES.UNFOLLOW]: 0, [ACTION_TYPES.REMOVE_FOLLOWER]: 0 };
}

export function totalOf(counts: Readonly<ActionCounts>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

export interface PlanOutcomes {
  /** Plans whose follow is gone in the export: done, so cleared. */
  completed: ActionCounts;
  /** Marked done, but the export still has the follow: back to planned. */
  reopened: ActionCounts;
}

/** WRITE: after an import has updated the follows, settles every plan against them. */
export function settlePlans(source: Pick<Master, "accounts">): PlanOutcomes {
  const outcomes: PlanOutcomes = { completed: emptyActionCounts(), reopened: emptyActionCounts() };
  for (const account of Object.values(source.accounts)) {
    for (const type of Object.values(ACTION_TYPES)) {
      const plan = planOf(account, type);
      if (plan === undefined) continue;
      if (!followExists(account, type)) {
        setPlan(account, type, undefined);
        outcomes.completed[type] += 1;
      } else if (plan === PLAN_STATES.DONE) {
        setPlan(account, type, PLAN_STATES.PLANNED);
        outcomes.reopened[type] += 1;
      }
    }
  }
  return outcomes;
}

export type PlanStats = Record<PlanState, ActionCounts>;

export function emptyPlanStats(): PlanStats {
  return { [PLAN_STATES.PLANNED]: emptyActionCounts(), [PLAN_STATES.DONE]: emptyActionCounts() };
}

/** WRITE (to `stats`): adds (sign 1) or removes (sign -1) one account's plans. */
export function countPlans(stats: PlanStats, account: ReadonlyAccount, sign: 1 | -1): void {
  for (const type of Object.values(ACTION_TYPES)) {
    const plan = planOf(account, type);
    if (plan !== undefined) stats[plan][type] += sign;
  }
}

export function planStats(source: DeepReadonly<Pick<Master, "accounts">>): PlanStats {
  const stats = emptyPlanStats();
  for (const account of Object.values(source.accounts)) countPlans(stats, account, 1);
  return stats;
}
