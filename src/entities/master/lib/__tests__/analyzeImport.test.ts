import { IMPORT_WARNINGS, analyzeImport } from '../analyzeImport.ts';
import { IMPORT_PROBLEMS } from '../importProblems.ts';

import { followersFile, followingFile, must, problemOf } from './helpers.ts';

const following = JSON.stringify(followingFile(['alice'], ['bob']));
const followers1 = JSON.stringify(followersFile(['alice']));
const followers2 = JSON.stringify(followersFile(['carol']));
const followers10 = JSON.stringify(followersFile(['zed']));
const DIR = 'instagram-me-2026/connections/followers_and_following';

describe('analyzeImport', () => {
  const input = (path: string, text: string) => ({ path, text });
  const prepare = (inputs: { path: string; text: string }[], lastKnownSavedAt: string | null = null) =>
    must(analyzeImport(inputs, lastKnownSavedAt).prepared);

  test('finds following, follower chunks in numeric order, and the master', () => {
    const master = { accounts: {}, lastSavedAt: '2026-10-01T00:00:00Z' };
    const { recognized, prepared } = analyzeImport(
      [
        input(`${DIR}/followers_10.json`, followers10),
        input(`${DIR}/followers_2.json`, followers2),
        input(`${DIR}/followers_1.json`, followers1),
        input(`${DIR}/following.json`, following),
        input('saved/unfollowism_master_2026-10-01.json', JSON.stringify(master)),
        input('x/liked_posts.json', '[]'),
        input('x/close_friends.json', JSON.stringify({ relationships_close_friends: [] })),
        input('x/broken.json', '{not json'),
      ],
      null,
    );

    expect(recognized).toEqual({
      followingCount: 2,
      followerFileCount: 3,
      followerCount: 3,
      master: {
        name: 'unfollowism_master_2026-10-01.json',
        path: 'saved/unfollowism_master_2026-10-01.json',
        savedAt: '2026-10-01T00:00:00Z',
      },
    });
    const result = must(prepared);
    expect(result.bundle.followers.map(account => account.username)).toEqual(['alice', 'carol', 'zed']);
    expect(result.bundle.following).toHaveLength(2);
    expect(result.bundle.followerFileCount).toBe(3);
    expect(result.rawMaster).toEqual(master);
    expect(result.warnings).toEqual([]);
  });

  test('no master is fine for a first-time user', () => {
    const { recognized, prepared } = analyzeImport(
      [input('following.json', following), input('followers_1.json', followers1)],
      null,
    );
    expect(recognized.master).toBeNull();
    expect(must(prepared).rawMaster).toBeNull();
    expect(must(prepared).warnings).toEqual([]);
  });

  test.each([
    [
      'nothing relevant',
      [input('liked_posts.json', '[]')],
      { followingCount: null, followerFileCount: 0, followerCount: null, master: null },
    ],
    [
      'missing following',
      [input('followers_1.json', followers1), input('followers_2.json', followers2)],
      { followingCount: null, followerFileCount: 2, followerCount: 2, master: null },
    ],
    [
      'missing followers',
      [input('following.json', following), input('m.json', '{"accounts":{}}')],
      {
        followingCount: 2,
        followerFileCount: 0,
        followerCount: null,
        master: { name: 'm.json', path: 'm.json', savedAt: null },
      },
    ],
  ])('incomplete selection is reported, not rejected: %s', (_, inputs, recognized) => {
    expect(analyzeImport(inputs, null)).toEqual({ recognized, prepared: null });
  });

  test('files without accounts are still found, counted as 0 (Import then reports them as empty)', () => {
    const { recognized } = analyzeImport(
      [input('following.json', JSON.stringify(followingFile())), input('followers_1.json', '[]')],
      null,
    );
    expect(recognized).toEqual({ followingCount: 0, followerFileCount: 1, followerCount: 0, master: null });
  });

  test.each([
    [
      'HTML export',
      [input('connections/following.html', '<html>'), input('connections/followers_1.html', '<html>')],
      { kind: IMPORT_PROBLEMS.HTML_EXPORT },
    ],
    [
      'two exports',
      [
        input('a/following.json', following),
        input('b/following.json', following),
        input('followers_1.json', followers1),
      ],
      { kind: IMPORT_PROBLEMS.SEVERAL_FOLLOWING_FILES, paths: ['a/following.json', 'b/following.json'] },
    ],
    [
      'same chunk twice',
      [
        input('following.json', following),
        input('a/followers_1.json', followers1),
        input('b/followers_1.json', followers1),
      ],
      { kind: IMPORT_PROBLEMS.DUPLICATE_FOLLOWER_FILE, name: 'followers_1.json' },
    ],
    [
      'two masters',
      [
        input('following.json', following),
        input('followers_1.json', followers1),
        input('m1.json', '{"accounts":{}}'),
        input('m2.json', '{"accounts":{}}'),
      ],
      { kind: IMPORT_PROBLEMS.SEVERAL_MASTERS, names: ['m1.json', 'm2.json'] },
    ],
  ])('rejects: %s', (_, inputs, problem) => {
    expect(problemOf(() => analyzeImport(inputs, null))).toEqual(problem);
  });

  test('warns when the chosen master is older than the last save from this browser', () => {
    const base = [input('following.json', following), input('followers_1.json', followers1)];
    const old = prepare(
      [...base, input('m.json', JSON.stringify({ accounts: {}, lastSavedAt: '2026-10-01T00:00:00Z' }))],
      '2026-10-20T00:00:00Z',
    );
    expect(old.warnings).toEqual([
      {
        kind: IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE,
        fileSavedAt: '2026-10-01T00:00:00Z',
        lastKnownSavedAt: '2026-10-20T00:00:00Z',
      },
    ]);

    const neverSaved = prepare([...base, input('m.json', '{"accounts":{}}')], '2026-10-20T00:00:00Z');
    expect(neverSaved.warnings[0]?.kind).toBe(IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE);

    const current = prepare(
      [...base, input('m.json', JSON.stringify({ accounts: {}, lastSavedAt: '2026-10-20T00:00:00Z' }))],
      '2026-10-20T00:00:00Z',
    );
    expect(current.warnings).toEqual([]);

    expect(prepare(base, '2026-10-20T00:00:00Z').warnings).toEqual([
      { kind: IMPORT_WARNINGS.NO_MASTER_BUT_SAVED_BEFORE, lastKnownSavedAt: '2026-10-20T00:00:00Z' },
    ]);
  });
});
