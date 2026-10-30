import {
  DecisionKind,
  PLAN_STATES,
  SESSION_CHANGES,
  type Decision,
  type Plans,
  type SessionChange,
} from '../../core/index.ts';
import { changeLine } from '../sessionText.ts';

const { PLANNED, DONE } = PLAN_STATES;
const kept: Decision = { kind: DecisionKind.KEPT };
const queued = (plans: Plans): Decision => ({ kind: DecisionKind.QUEUED, plans });
const decision = (from: Decision | null, to: Decision | null): SessionChange => ({
  type: SESSION_CHANGES.DECISION_CHANGED,
  from,
  to,
});

test.each<[SessionChange, string]>([
  [decision(null, kept), '→ Needs a decision → Kept'],
  [decision(kept, null), '→ Kept → Needs a decision'],
  [decision(kept, queued({ unfollow: PLANNED })), '→ Kept → Unfollow queued'],
  [decision(queued({ removeFollower: PLANNED }), queued({ removeFollower: DONE })), '→ Removal queued → Removal done'],
  [
    decision(null, queued({ unfollow: DONE, removeFollower: PLANNED })),
    '→ Needs a decision → Unfollow done + Removal queued',
  ],
  [{ type: SESSION_CHANGES.TAG_ADDED, tag: 'artist' }, '+ Added tag artist'],
  [{ type: SESSION_CHANGES.TAG_REMOVED, tag: 'dog' }, '− Removed tag dog'],
  [{ type: SESSION_CHANGES.UNAVAILABLE_MARKED }, '• Marked unavailable'],
  [{ type: SESSION_CHANGES.UNAVAILABLE_CLEARED }, '• Cleared unavailable'],
  [{ type: SESSION_CHANGES.NOTE_EDITED }, '✎ Edited note'],
])('%o', (change, expected) => {
  const { symbol, text } = changeLine(change);
  expect(`${symbol} ${text}`).toBe(expected);
});
