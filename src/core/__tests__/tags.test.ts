import { findTag, removeTagFrom, renameTagOn, tagCounts, tagsInUse } from '../index.ts';

import { account, stateWith } from './helpers.ts';

function tagged(name: string, ...tags: string[]) {
  const a = account(name);
  a.review.tags = tags;
  return a;
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
  const a = tagged('a', 'illustration', 'artist', 'dog');
  renameTagOn(a, 'illustration', 'artist');
  expect(a.review.tags).toEqual(['artist', 'dog']);
  renameTagOn(a, 'dog', 'dogs');
  expect(a.review.tags).toEqual(['artist', 'dogs']);
  removeTagFrom(a, 'artist');
  expect(a.review.tags).toEqual(['dogs']);
});
