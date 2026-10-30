import {
  ACTION_TYPES,
  DecisionKind,
  PLAN_STATES,
  SESSION_CATEGORIES,
  SESSION_CHANGES,
  type ActionType,
  type Decision,
  type DeepReadonly,
  type PlanState,
  type SessionCategory,
  type SessionChange,
} from '../core/index.ts';

/** How a queued plan is named in change lines: "Unfollow queued", "Removal done". */
const PLAN_NOUNS: Record<ActionType, string> = {
  [ACTION_TYPES.UNFOLLOW]: 'Unfollow',
  [ACTION_TYPES.REMOVE_FOLLOWER]: 'Removal',
};
const PLAN_STATE_WORDS: Record<PlanState, string> = {
  [PLAN_STATES.PLANNED]: 'queued',
  [PLAN_STATES.DONE]: 'done',
};

/** "Needs a decision", "Kept", "Unfollow queued", "Unfollow done + Removal queued". `null` = needs a decision. */
export function decisionText(decision: DeepReadonly<Decision> | null): string {
  if (decision === null) {
    return 'Needs a decision';
  }
  if (decision.kind === DecisionKind.KEPT) {
    return 'Kept';
  }
  return Object.values(ACTION_TYPES)
    .flatMap(type => {
      const plan = decision.plans[type];
      return plan === undefined ? [] : [`${PLAN_NOUNS[type]} ${PLAN_STATE_WORDS[plan]}`];
    })
    .join(' + ');
}

export const CATEGORY_LABELS: Record<SessionCategory, string> = {
  [SESSION_CATEGORIES.DECISIONS]: 'Decisions',
  [SESSION_CATEGORIES.TAGS]: 'Tags',
  [SESSION_CATEGORIES.OTHER]: 'Other',
};

/** A symbol and a sentence for one change line. */
export function changeLine(change: SessionChange): { symbol: string; text: string } {
  switch (change.type) {
    case SESSION_CHANGES.DECISION_CHANGED:
      return { symbol: '→', text: `${decisionText(change.from)} → ${decisionText(change.to)}` };
    case SESSION_CHANGES.TAG_ADDED:
      return { symbol: '+', text: `Added tag ${change.tag}` };
    case SESSION_CHANGES.TAG_REMOVED:
      return { symbol: '−', text: `Removed tag ${change.tag}` };
    case SESSION_CHANGES.UNAVAILABLE_MARKED:
      return { symbol: '•', text: 'Marked unavailable' };
    case SESSION_CHANGES.UNAVAILABLE_CLEARED:
      return { symbol: '•', text: 'Cleared unavailable' };
    case SESSION_CHANGES.NOTE_EDITED:
      return { symbol: '✎', text: 'Edited note' };
    case SESSION_CHANGES.ACCOUNT_REMOVED:
      return { symbol: '→', text: 'Moved to its new name' };
    case SESSION_CHANGES.RENAME_DISMISSED:
      return { symbol: '×', text: 'Not a rename' };
  }
}
