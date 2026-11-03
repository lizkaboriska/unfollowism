import {
  SESSION_CHANGES,
  TagChangeKind,
  type SessionChange,
  type TagChangeRow,
} from '@/entities/master/lib/sessionDiff.ts';
import { DecisionKind, PLAN_STATES, type Decision, type Plans } from '@/entities/master/lib/types.ts';

import { changeText, tagRowText } from '../sessionText.ts';

const { PLANNED, DONE } = PLAN_STATES;
const kept: Decision = { kind: DecisionKind.KEPT };
const queued = (plans: Plans): Decision => ({ kind: DecisionKind.QUEUED, plans });
const decision = (from: Decision | null, to: Decision | null): SessionChange => ({
  type: SESSION_CHANGES.DECISION_CHANGED,
  from,
  to,
});

test.each<[SessionChange, string]>([
  [decision(null, kept), 'Needs a decision → Kept'],
  [decision(kept, null), 'Kept → Needs a decision'],
  [decision(kept, queued({ unfollow: PLANNED })), 'Kept → Unfollow queued'],
  [decision(queued({ removeFollower: PLANNED }), queued({ removeFollower: DONE })), 'Removal queued → Removal done'],
  [
    decision(null, queued({ unfollow: DONE, removeFollower: PLANNED })),
    'Needs a decision → Unfollow done + Removal queued',
  ],
  [{ type: SESSION_CHANGES.TAG_ADDED, tag: 'artist' }, '+ #artist tag'],
  [{ type: SESSION_CHANGES.TAG_REMOVED, tag: 'dog' }, '− #dog tag'],
  [{ type: SESSION_CHANGES.UNAVAILABLE_MARKED }, 'Marked unavailable'],
  [{ type: SESSION_CHANGES.UNAVAILABLE_CLEARED }, 'No longer unavailable'],
  [{ type: SESSION_CHANGES.NOTE_EDITED }, 'Note edited'],
  [{ type: SESSION_CHANGES.ACCOUNT_REMOVED }, 'Moved to its new name'],
  [{ type: SESSION_CHANGES.RENAME_DISMISSED }, 'Not a rename'],
])('%o', (change, expected) => {
  expect(changeText(change)).toBe(expected);
});

test.each<[TagChangeRow, string]>([
  [{ kind: TagChangeKind.ADDED, tag: 'friends', usernames: ['ann'] }, '+ #friends tag'],
  [{ kind: TagChangeKind.REMOVED, tag: 'friends', usernames: ['ann'] }, '− #friends tag'],
  [
    { kind: TagChangeKind.RENAMED, from: 'inspiration', to: 'quiet-feed', usernames: ['ann'] },
    '#inspiration → #quiet-feed',
  ],
])('tag row %#', (row, expected) => {
  expect(tagRowText(row)).toBe(expected);
});
