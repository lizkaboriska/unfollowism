import {
  ACTION_TYPES,
  DecisionKind,
  SESSION_CATEGORIES,
  SESSION_CHANGES,
  type Decision,
  type DeepReadonly,
  type SessionCategory,
  type SessionChange,
} from '../core/index.ts';

import { planText } from './labels.ts';

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
      return plan === undefined ? [] : [planText(type, plan)];
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
