import { emptyActionCounts } from '../../lib/actions.ts';
import type { ImportSummary } from '../../lib/merge.ts';
import { ACTION_TYPES, FOLLOW_CHANGES } from '../../lib/types.ts';
import { STATUS_EVENTS, type StatusEvent } from '../../model/statuses.ts';
import { errorMessage, statusText } from '../statusText.ts';

const summary: ImportSummary = {
  exportChanged: true,
  followingCount: 1,
  followersCount: 1,
  changes: {
    [FOLLOW_CHANGES.NEW_FOLLOWS]: 3,
    [FOLLOW_CHANGES.UNFOLLOWED]: 1,
    [FOLLOW_CHANGES.NEW_FOLLOWERS]: 2,
    [FOLLOW_CHANGES.LOST_FOLLOWERS]: 1,
  },
  plans: { completed: emptyActionCounts(), reopened: emptyActionCounts() },
};
const imported = (overrides: Partial<ImportSummary> = {}, isNewMaster = false): StatusEvent => ({
  type: STATUS_EVENTS.IMPORTED,
  isNewMaster,
  followerFileCount: 1,
  summary: { ...summary, ...overrides },
});

test.each([
  ['nothing yet', null, ''],
  [
    'new master',
    imported({}, true),
    'Started a new master from 1 follower file. 1 following, 1 followers. Save master to keep it.',
  ],
  [
    'changed export with settled plans',
    imported({
      plans: {
        completed: { [ACTION_TYPES.UNFOLLOW]: 2, [ACTION_TYPES.REMOVE_FOLLOWER]: 1 },
        reopened: { [ACTION_TYPES.UNFOLLOW]: 1, [ACTION_TYPES.REMOVE_FOLLOWER]: 0 },
      },
    }),
    'New export loaded from 1 follower file — not saved yet. 1 following, 1 followers. ' +
      'Since your last save: 3 new follows, 1 unfollowed, 2 new followers, 1 lost follower. ' +
      '2 planned unfollows done. 1 planned follower removal done. ' +
      '1 account marked done but still followed: back in To unfollow.',
  ],
  [
    'same export',
    imported({ exportChanged: false }),
    'Loaded 1 follower file: same as the last import. 1 following, 1 followers. ' +
      'Since your last save: 3 new follows, 1 unfollowed, 2 new followers, 1 lost follower.',
  ],
  ['saved (shown as a toast instead)', { type: STATUS_EVENTS.SAVED }, ''],
  ['save failed', { type: STATUS_EVENTS.SAVE_FAILED, reason: 'disk full' }, 'Try Save again. Error: disk full'],
  [
    'save failed without a message',
    { type: STATUS_EVENTS.SAVE_FAILED, reason: null },
    'Try Save again. Error: unexpected error',
  ],
] as const)('%s', (_, status, expected) => {
  expect(statusText(status)).toBe(expected);
});

test.each([
  ['a string', 'No accounts found', 'No accounts found'],
  ['an Error', new Error('Broken zip'), 'Broken zip'],
  ["Redux Toolkit's plain error object", { name: 'TypeError', message: 'x is undefined' }, 'x is undefined'],
  ['something else', 42, 'Unexpected error'],
])('error message from %s', (_, error, expected) => {
  expect(errorMessage(error)).toBe(expected);
});
