// @vitest-environment node
// Local only: runs your real master and Instagram export through the import, as a safety net for
// format and logic changes. Skipped when the files aren't in the project folder (they never go to git).
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isPastAccount, planOf } from '../decision.ts';
import { parseMaster, stringifyMasterFile, toMasterFile } from '../masterFile.ts';
import { importExport } from '../merge.ts';
import { parseFollowersJson, parseFollowingJson } from '../parse.ts';
import { ACTION_TYPES } from '../types.ts';
import { usernameKey } from '../util.ts';

import { must } from './helpers.ts';

const ROOT = fileURLToPath(new URL('../../../../../', import.meta.url));
const NOW = '2030-01-01T00:00:00.000Z';
const MASTER = 'instagram_master_tracker.json';
const realData = existsSync(join(ROOT, MASTER)) && existsSync(join(ROOT, 'connections/following.json'));

describe.skipIf(!realData)('your real data (local only)', () => {
  const text = (path: string) => readFileSync(join(ROOT, path), 'utf8');
  const read = (path: string): unknown => JSON.parse(text(path));
  const followerNames = () =>
    readdirSync(join(ROOT, 'connections'))
      .filter(fileName => /^followers_\d+\.json$/.test(fileName))
      .sort((first, second) => parseInt(first.slice(10)) - parseInt(second.slice(10)));
  const bundle = (following: unknown, followerRaws: unknown[]) => ({
    following: parseFollowingJson(following),
    followers: followerRaws.flatMap(parseFollowersJson),
    followerFileCount: followerRaws.length,
  });

  test('your master + the export it came from: only past accounts lose a decision, then it saves back as is', () => {
    const sameExport = () =>
      bundle(
        read('connections/following.json'),
        followerNames().map(fileName => read(`connections/${fileName}`)),
      );
    const first = importExport(read(MASTER), sameExport(), NOW);
    expect(first.exportChanged).toBe(false);
    const before = parseMaster(read(MASTER)).accounts;
    expect(Object.keys(first.master.accounts)).toEqual(Object.keys(before));
    for (const [key, account] of Object.entries(first.master.accounts)) {
      const old = must(before[key]);
      if (old.decision !== undefined && account.decision === undefined) {
        expect(isPastAccount(account), `${key} lost its decision`).toBe(true);
        delete old.decision;
      }
      expect(account, key).toEqual(old);
    }

    const saved = stringifyMasterFile(toMasterFile(first.master));
    const second = importExport(JSON.parse(saved), sameExport(), NOW);
    expect(second.dirty).toBe(false);
    expect(stringifyMasterFile(toMasterFile(second.master))).toBe(saved);
  });

  test('an export where every planned unfollow happened and 3 followers left', () => {
    const master = read(MASTER);
    const planned = new Set(
      Object.entries(parseMaster(master).accounts)
        .filter(([, account]) => planOf(account, ACTION_TYPES.UNFOLLOW) !== undefined)
        .map(([key]) => key),
    );
    expect(planned.size).toBeGreaterThan(0);

    const following = read('connections/following.json') as { relationships_following: { title: string }[] };
    following.relationships_following = following.relationships_following.filter(
      item => !planned.has(usernameKey(item.title)),
    );
    const followerRaws = followerNames().map(
      fileName => read(`connections/${fileName}`) as { string_list_data: { value: string }[] }[],
    );
    const left = (followerRaws[0] ?? []).slice(0, 3).map(item => usernameKey(must(item.string_list_data[0]).value));
    followerRaws[0] = (followerRaws[0] ?? []).slice(3);

    const result = importExport(master, bundle(following, followerRaws), NOW);
    expect(result.exportChanged).toBe(true);
    expect(result.plans.completed[ACTION_TYPES.UNFOLLOW]).toBe(planned.size);
    for (const key of planned) {
      expect(result.master.accounts[key]).toMatchObject({ following: null, unfollowedSeenAt: NOW });
    }
    for (const key of planned) {
      expect(planOf(must(result.master.accounts[key]), ACTION_TYPES.UNFOLLOW)).toBeUndefined();
    }
    for (const key of left) {
      expect(result.master.accounts[key]).toMatchObject({ followedBy: null, unfollowedMeSeenAt: NOW });
    }
  });
});
