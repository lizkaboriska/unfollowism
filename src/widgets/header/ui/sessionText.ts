import {
  ACTION_TYPES,
  DecisionKind,
  SESSION_CHANGES,
  TagChangeKind,
  type Decision,
  type SessionChange,
  type TagChangeRow,
} from '@/entities/master/lib/index.ts';
import { planText } from '@/entities/master/ui/labels.ts';
import type { DeepReadonly } from '@/shared/lib/deepReadonly.ts';

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

/** One smaller line under an account in Unsaved changes; decision changes have their own line (decisionText). */
export function changeText(change: SessionChange): string {
  switch (change.type) {
    case SESSION_CHANGES.DECISION_CHANGED:
      return `${decisionText(change.from)} → ${decisionText(change.to)}`;
    case SESSION_CHANGES.TAG_ADDED:
      return `+ #${change.tag} tag`;
    case SESSION_CHANGES.TAG_REMOVED:
      return `− #${change.tag} tag`;
    case SESSION_CHANGES.UNAVAILABLE_MARKED:
      return 'Marked unavailable';
    case SESSION_CHANGES.UNAVAILABLE_CLEARED:
      return 'No longer unavailable';
    case SESSION_CHANGES.NOTE_EDITED:
      return 'Note edited';
    case SESSION_CHANGES.ACCOUNT_REMOVED:
      return 'Moved to its new name';
    case SESSION_CHANGES.RENAME_DISMISSED:
      return 'Not a rename';
  }
}

/** A Tag changes row: "+ #friends tag", "− #friends tag" or "#inspiration → #quiet-feed". */
export function tagRowText(row: TagChangeRow): string {
  switch (row.kind) {
    case TagChangeKind.ADDED:
      return `+ #${row.tag} tag`;
    case TagChangeKind.REMOVED:
      return `− #${row.tag} tag`;
    case TagChangeKind.RENAMED:
      return `#${row.from} → #${row.to}`;
  }
}
