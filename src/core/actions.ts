import { ACTION_TYPES, PLAN_STATES, type Account, type ActionType, type DeepReadonly, type Follow, type Master, type PlanState, type ReadonlyAccount } from "./types.ts";

/** The account field that holds each action's plan. */
export const PLAN_FIELDS = { [ACTION_TYPES.UNFOLLOW]: "toUnfollow", [ACTION_TYPES.REMOVE_FOLLOWER]: "toRemove" } as const satisfies Record<ActionType, keyof Account>;

/** The plan for an action, or undefined when it isn't marked. */
export function planOf(account: ReadonlyAccount, type: ActionType): PlanState | undefined {
  return account[PLAN_FIELDS[type]];
}

/** The follow the action ends (you follow them / they follow you), as of the latest export; null when there is none. */
export function followOf(account: ReadonlyAccount, type: ActionType): DeepReadonly<Follow> | null {
  return type === ACTION_TYPES.UNFOLLOW ? account.following : account.followedBy;
}

/** Whether the follow the action ends still exists. A new plan needs it. */
export function followExists(account: ReadonlyAccount, type: ActionType): boolean {
  return followOf(account, type) !== null;
}

/** WRITE: sets the plan (undefined = not marked). Planning requires the follow to exist; throws otherwise (a caller bug). */
export function setPlan(account: Account, type: ActionType, state: PlanState | undefined): void {
  const field = PLAN_FIELDS[type];
  if (state === undefined) {
    if (type === ACTION_TYPES.UNFOLLOW) delete account.toUnfollow;
    else delete account.toRemove;
    return;
  }
  if (account[field] === undefined && !followExists(account, type)) throw new Error(`setPlan: no follow for ${type}`);
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
