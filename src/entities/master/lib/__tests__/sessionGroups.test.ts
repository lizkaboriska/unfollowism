import {
  SESSION_CHANGES,
  TagChangeKind,
  groupSessionChanges,
  type SessionAccountChanges,
  type SessionChange,
} from '../sessionDiff.ts';
import { DecisionKind } from '../types.ts';

const added = (tag: string): SessionChange => ({ type: SESSION_CHANGES.TAG_ADDED, tag });
const removed = (tag: string): SessionChange => ({ type: SESSION_CHANGES.TAG_REMOVED, tag });
const note: SessionChange = { type: SESSION_CHANGES.NOTE_EDITED };
const keptNow: SessionChange = {
  type: SESSION_CHANGES.DECISION_CHANGED,
  from: null,
  to: { kind: DecisionKind.KEPT },
};
const diff = (...entries: [string, ...SessionChange[]][]): SessionAccountChanges[] =>
  entries.map(([username, ...changes]) => ({ username, changes }));

test('tag changes become one row per tag, most accounts first; other changes stay per account', () => {
  const grouped = groupSessionChanges(
    diff(['ann', added('friends'), keptNow], ['bob', added('friends'), removed('dog')], ['cy', note, added('art')]),
  );
  expect(grouped.tagRows).toEqual([
    { kind: TagChangeKind.ADDED, tag: 'friends', usernames: ['ann', 'bob'] },
    { kind: TagChangeKind.ADDED, tag: 'art', usernames: ['cy'] },
    { kind: TagChangeKind.REMOVED, tag: 'dog', usernames: ['bob'] },
  ]);
  // bob only had tag changes, so he is only in the tag rows.
  expect(grouped.accounts).toEqual(diff(['ann', keptNow], ['cy', note]));
});

test('exactly the accounts that lost one tag gained another: a rename', () => {
  const grouped = groupSessionChanges(
    diff(
      ['ann', removed('inspiration'), added('quiet-feed')],
      ['bob', removed('inspiration'), added('quiet-feed'), note],
      ['cy', added('friends')],
    ),
  );
  expect(grouped.tagRows).toEqual([
    { kind: TagChangeKind.RENAMED, from: 'inspiration', to: 'quiet-feed', usernames: ['ann', 'bob'] },
    { kind: TagChangeKind.ADDED, tag: 'friends', usernames: ['cy'] },
  ]);
  expect(grouped.accounts).toEqual(diff(['bob', note]));
});

test('not quite the same accounts: no rename', () => {
  // bob already had #quiet-feed, so he lost #inspiration without gaining anything.
  const grouped = groupSessionChanges(
    diff(['ann', removed('inspiration'), added('quiet-feed')], ['bob', removed('inspiration')]),
  );
  expect(grouped.tagRows).toEqual([
    { kind: TagChangeKind.REMOVED, tag: 'inspiration', usernames: ['ann', 'bob'] },
    { kind: TagChangeKind.ADDED, tag: 'quiet-feed', usernames: ['ann'] },
  ]);
});

test('two tags could be the new name: no rename', () => {
  const grouped = groupSessionChanges(diff(['ann', removed('old'), added('new'), added('other')]));
  expect(grouped.tagRows).toEqual([
    { kind: TagChangeKind.ADDED, tag: 'new', usernames: ['ann'] },
    { kind: TagChangeKind.REMOVED, tag: 'old', usernames: ['ann'] },
    { kind: TagChangeKind.ADDED, tag: 'other', usernames: ['ann'] },
  ]);
});

test('no changes: nothing to show', () => {
  expect(groupSessionChanges([])).toEqual({ tagRows: [], accounts: [] });
});
