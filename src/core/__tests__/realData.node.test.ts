// @vitest-environment node
// Local only: runs your real master and Instagram export through the import, as a safety net for
// format and logic changes. Skipped when the files aren't in the project folder (they never go to git).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ACTION_TYPES,
  importExport,
  parseFollowersJson,
  parseFollowingJson,
  parseMaster,
  stringifyMasterFile,
  toMasterFile,
  usernameKey,
} from '../index.ts';

import { must } from './helpers.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const NOW = '2030-01-01T00:00:00.000Z';
const MASTER = 'instagram_master_tracker.json';
const realData = existsSync(join(ROOT, MASTER)) && existsSync(join(ROOT, 'connections/following.json'));

describe.skipIf(!realData)('your real data (local only)', () => {
  const text = (path: string) => readFileSync(join(ROOT, path), 'utf8');
  const read = (path: string): unknown => JSON.parse(text(path));
  const followerNames = () =>
    readdirSync(join(ROOT, 'connections'))
      .filter(n => /^followers_\d+\.json$/.test(n))
      .sort((a, b) => parseInt(a.slice(10)) - parseInt(b.slice(10)));
  const bundle = (following: unknown, followerRaws: unknown[]) => ({
    following: parseFollowingJson(following),
    followers: followerRaws.flatMap(parseFollowersJson),
    followerFileCount: followerRaws.length,
  });

  test('your master + the export it came from: nothing changes, and it saves back byte for byte', () => {
    const result = importExport(
      read(MASTER),
      bundle(
        read('connections/following.json'),
        followerNames().map(n => read(`connections/${n}`)),
      ),
      NOW,
    );
    expect(result.summary.exportChanged).toBe(false);
    expect(result.dirty).toBe(false);
    expect(stringifyMasterFile(toMasterFile(result.master))).toBe(text(MASTER));
  });

  test('an export where every planned unfollow happened and 3 followers left', () => {
    const master = read(MASTER);
    const planned = new Set(
      Object.entries(parseMaster(master).accounts)
        .filter(([, a]) => a.toUnfollow !== undefined)
        .map(([key]) => key),
    );
    expect(planned.size).toBeGreaterThan(0);

    const following = read('connections/following.json') as { relationships_following: { title: string }[] };
    following.relationships_following = following.relationships_following.filter(
      item => !planned.has(usernameKey(item.title)),
    );
    const followerRaws = followerNames().map(
      n => read(`connections/${n}`) as { string_list_data: { value: string }[] }[],
    );
    const left = (followerRaws[0] ?? []).slice(0, 3).map(item => usernameKey(must(item.string_list_data[0]).value));
    followerRaws[0] = (followerRaws[0] ?? []).slice(3);

    const result = importExport(master, bundle(following, followerRaws), NOW);
    expect(result.summary.exportChanged).toBe(true);
    expect(result.summary.plans.completed[ACTION_TYPES.UNFOLLOW]).toBe(planned.size);
    for (const key of planned) {
      expect(result.master.accounts[key]).toMatchObject({ following: null, unfollowedSeenAt: NOW });
    }
    for (const key of planned) {
      expect(result.master.accounts[key]?.toUnfollow).toBeUndefined();
    }
    for (const key of left) {
      expect(result.master.accounts[key]).toMatchObject({ followedBy: null, unfollowedMeSeenAt: NOW });
    }
  });
});
