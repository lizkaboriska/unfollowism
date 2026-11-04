import { STATUS_EVENTS } from '../../model/statuses.ts';
import { errorMessage, statusText } from '../statusText.ts';

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

test.each([
  ['a string', 'No accounts found', 'No accounts found'],
  ['an Error', new Error('Broken zip'), 'Broken zip'],
  ["Redux Toolkit's plain error object", { name: 'TypeError', message: 'x is undefined' }, 'x is undefined'],
  ['something else', 42, 'Unexpected error'],
])('error message from %s', (_, error, expected) => {
  expect(errorMessage(error)).toBe(expected);
});
