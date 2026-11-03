import { FIELD_TYPES, IMPORT_PROBLEMS, type ImportProblem } from '@/entities/master';

import { importProblemText } from '../importProblemText.ts';

test.each<[string, ImportProblem, string]>([
  [
    'two Following files',
    { kind: IMPORT_PROBLEMS.SEVERAL_FOLLOWING_FILES, paths: ['a/following.json', 'b/following.json'] },
    'Found more than one Following file (a/following.json and b/following.json). ' +
      'Choose files from a single Instagram export.',
  ],
  [
    'a follower file twice',
    { kind: IMPORT_PROBLEMS.DUPLICATE_FOLLOWER_FILE, name: 'followers_1.json' },
    'Found followers_1.json twice. Choose files from a single Instagram export.',
  ],
  [
    'two masters',
    { kind: IMPORT_PROBLEMS.SEVERAL_MASTERS, names: ['m1.json', 'm2.json'] },
    'Found 2 progress files (m1.json, m2.json). Choose only the newest one.',
  ],
  [
    'HTML export',
    { kind: IMPORT_PROBLEMS.HTML_EXPORT },
    'This export is in HTML format. In Instagram, request “Export your information” again ' +
      '(called Download your information in some versions) and choose the JSON format.',
  ],
  [
    'empty Following',
    { kind: IMPORT_PROBLEMS.NO_FOLLOWING },
    'No accounts found in the Following file of this export.',
  ],
  [
    'empty Followers',
    { kind: IMPORT_PROBLEMS.NO_FOLLOWERS },
    'No accounts found in the Followers files of this export.',
  ],
  ['not a master', { kind: IMPORT_PROBLEMS.NOT_A_MASTER }, 'This file is not an Unfollowism progress file.'],
  [
    'other version',
    { kind: IMPORT_PROBLEMS.INCOMPATIBLE_VERSION },
    "This file wasn't saved by a compatible version of Unfollowism.",
  ],
  [
    'wrong type',
    { kind: IMPORT_PROBLEMS.INVALID_FIELD, path: 'accounts.bob.review.tags', expected: FIELD_TYPES.LIST },
    'Invalid progress file: accounts.bob.review.tags should be a list.',
  ],
  [
    'not a date',
    { kind: IMPORT_PROBLEMS.INVALID_FIELD, path: 'lastSavedAt', expected: FIELD_TYPES.DATE },
    'Invalid progress file: lastSavedAt should be a date.',
  ],
  [
    'not one of the options',
    {
      kind: IMPORT_PROBLEMS.INVALID_FIELD,
      path: 'accounts.bob.toUnfollow',
      expected: FIELD_TYPES.ONE_OF,
      options: ['planned', 'done'],
    },
    'Invalid progress file: accounts.bob.toUnfollow should be one of planned, done.',
  ],
  [
    'unknown field',
    { kind: IMPORT_PROBLEMS.UNKNOWN_FIELD, path: 'accounts.bob.plans' },
    'Invalid progress file: accounts.bob.plans is not a known field.',
  ],
  [
    'account twice',
    { kind: IMPORT_PROBLEMS.DUPLICATE_ACCOUNT, username: 'BOB' },
    'Invalid progress file: account "BOB" appears twice.',
  ],
])('%s', (_, problem, expected) => {
  expect(importProblemText(problem)).toBe(expected);
});
