import { followExists, isKept, isPastAccount, keep, planOf, setPlan, undecide } from './decision.ts';
import {
  ACTION_TYPES,
  PLAN_STATES,
  type ActionType,
  type DeepReadonly,
  type Master,
  type PlanState,
  type ReadonlyAccount,
} from './types.ts';
import { createDict } from './util.ts';

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

export interface SettledDecisions {
  plans: PlanOutcomes;
  /** Account key → the plans this import found done (the counted ones in `plans.completed`). */
  completedPlans: Record<string, ActionType[]>;
  /** Decisions the export made out of date (see settleDecisions): taken back to none. */
  undecided: number;
}

/**
 * WRITE: after an import has updated the follows, settles every decision against them:
 * - plans whose follow is gone are done and cleared; an account whose last plan happened becomes Kept while you are
 *   still connected;
 * - a Kept account in `lostFollowers` (they stopped following you in this export) needs a decision again;
 * - a past account loses any decision: there is nothing left to decide.
 * Plans on `uncounted` accounts (likely renames) are cleared like the rest but not reported as done. Accounts with
 * a rename suggestion keep their decision, to move it to the new name.
 */
export function settleDecisions(
  source: Pick<Master, 'accounts'>,
  {
    uncounted = new Set(),
    lostFollowers = new Set(),
  }: { uncounted?: ReadonlySet<string>; lostFollowers?: ReadonlySet<string> } = {},
): SettledDecisions {
  const outcomes: PlanOutcomes = { completed: emptyActionCounts(), reopened: emptyActionCounts() };
  const completedPlans = createDict<ActionType[]>();
  let undecided = 0;
  for (const [key, account] of Object.entries(source.accounts)) {
    // Before plans settle: a removal you did turns into Kept below, and must not count as them leaving.
    const keptBefore = isKept(account);
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
          (completedPlans[key] ??= []).push(type);
        }
      } else if (plan === PLAN_STATES.DONE) {
        setPlan(account, type, PLAN_STATES.PLANNED);
        outcomes.reopened[type] += 1;
      }
    }
    // Every plan happened: you acted on the account, so it counts as decided.
    if (completed && account.decision === undefined && !isPastAccount(account)) {
      keep(account);
    }
    if (account.renameSuggestion !== undefined || account.decision === undefined) {
      continue;
    }
    if (isPastAccount(account) || (keptBefore && lostFollowers.has(key))) {
      undecide(account);
      undecided += 1;
    }
  }
  return { plans: outcomes, completedPlans, undecided };
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
