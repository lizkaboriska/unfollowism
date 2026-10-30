import { followExists, keep, planOf, setPlan } from './decision.ts';
import {
  ACTION_TYPES,
  PLAN_STATES,
  type ActionType,
  type DeepReadonly,
  type Master,
  type PlanState,
  type ReadonlyAccount,
} from './types.ts';

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

/**
 * WRITE: after an import has updated the follows, settles every plan against them. An account whose last plan
 * happened becomes Kept. Plans on `uncounted` accounts (likely renames) are cleared like the rest but not reported as
 * done.
 */
export function settlePlans(
  source: Pick<Master, 'accounts'>,
  uncounted: ReadonlySet<string> = new Set(),
): PlanOutcomes {
  const outcomes: PlanOutcomes = { completed: emptyActionCounts(), reopened: emptyActionCounts() };
  for (const [key, account] of Object.entries(source.accounts)) {
    let completed = false;
    for (const type of Object.values(ACTION_TYPES)) {
      const plan = planOf(account, type);
      if (plan === undefined) {
        continue;
      }
      if (!followExists(account, type)) {
        setPlan(account, type, undefined);
        completed = true;
        if (!uncounted.has(key)) {
          outcomes.completed[type] += 1;
        }
      } else if (plan === PLAN_STATES.DONE) {
        setPlan(account, type, PLAN_STATES.PLANNED);
        outcomes.reopened[type] += 1;
      }
    }
    // Every plan happened: you acted on the account, so it counts as decided.
    if (completed && account.decision === undefined) {
      keep(account);
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
    if (plan !== undefined) {
      stats[plan][type] += sign;
    }
  }
}

export function planStats(source: DeepReadonly<Pick<Master, 'accounts'>>): PlanStats {
  const stats = emptyPlanStats();
  for (const account of Object.values(source.accounts)) {
    countPlans(stats, account, 1);
  }
  return stats;
}
