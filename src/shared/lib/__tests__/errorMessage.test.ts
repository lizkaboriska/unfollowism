import { errorMessage } from '../errorMessage.ts';

test.each([
  ['a string', 'No accounts found', 'No accounts found'],
  ['an Error', new Error('Broken zip'), 'Broken zip'],
  ["Redux Toolkit's plain error object", { name: 'TypeError', message: 'x is undefined' }, 'x is undefined'],
  ['something else', 42, 'Unexpected error'],
])('error message from %s', (_, error, expected) => {
  expect(errorMessage(error)).toBe(expected);
});
