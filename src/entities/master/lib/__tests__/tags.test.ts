import { findTag, removeTagFrom, renameTagOn, tagCounts, tagsInUse } from '../tags.ts';

import { account, stateWith } from './helpers.ts';

function tagged(name: string, ...tags: string[]) {
  const taggedAccount = account(name);
  taggedAccount.review.tags = tags;
  return taggedAccount;
}

test('tags exist only while an account has them, listed alphabetically', () => {
  const counts = tagCounts(stateWith(tagged('a', 'dog', 'artist'), tagged('b', 'artist'), tagged('c')));
  expect(counts).toEqual({ dog: 1, artist: 2 });
  expect(tagsInUse({ ...counts, zero: 0 })).toEqual(['artist', 'dog']);
});

test('an existing tag is found in any letter case', () => {
  expect(findTag(['artist', 'dog'], '  Artist ')).toBe('artist');
  expect(findTag(['artist'], 'art')).toBeUndefined();
});

test('renaming merges into a tag the account already has; removing drops just that tag', () => {
  const user = tagged('a', 'illustration', 'artist', 'dog');
  renameTagOn(user, 'illustration', 'artist');
  expect(user.review.tags).toEqual(['artist', 'dog']);
  renameTagOn(user, 'dog', 'dogs');
  expect(user.review.tags).toEqual(['artist', 'dogs']);
  removeTagFrom(user, 'artist');
  expect(user.review.tags).toEqual(['dogs']);
});
