import { STATUS_EVENTS } from '../../model/statuses.ts';
import { statusText } from '../statusText.ts';

test.each([
  ['nothing yet', null, ''],
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
