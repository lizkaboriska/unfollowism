// @vitest-environment node
// Scale benchmark: `npm run test:perf`. Not part of `npm test` (slow, machine-dependent).
// Prints a timing table; the limits below are the agreed targets.
import { must } from '../core/__tests__/helpers.ts';
import { DecisionKind, importExport, stringifyMasterFile, toMasterFile } from '../core/index.ts';
import { analyzeImport } from '../io/analyzeImport.ts';
import { memoryLastSaved } from '../io/lastSaved.ts';
import { createMemoryTabDatabase } from '../io/tabStore.ts';
import { setQuery } from '../store/filtersSlice.ts';
import { makeStore } from '../store/index.ts';
import { setNote } from '../store/masterSlice.ts';
import {
  selectAccount,
  selectRelationshipStats,
  selectScopeStats,
  selectUnsavedDiff,
  selectUnsavedAccountCount,
  selectVisibleAccountKeys,
} from '../store/selectors.ts';
import { importPrepared, restoreTab, saveMaster } from '../store/thunks.ts';

const INSTAGRAM_FOLLOWING_CAP = 7_500;
const MUTUAL = 5_000;

/** An Instagram-shaped export with `total` distinct accounts. */
function exportTexts(total: number, seed = 0) {
  const name = (i: number) => `user_${i}`;
  const following = Array.from({ length: INSTAGRAM_FOLLOWING_CAP }, (_, i) => ({
    title: name(i),
    string_list_data: [{ href: `https://www.instagram.com/_u/${name(i)}`, timestamp: 1_600_000_000 + i }],
  }));
  const followerCount = total - INSTAGRAM_FOLLOWING_CAP + MUTUAL;
  const followers = Array.from({ length: followerCount }, (_, k) => {
    // seed shifts followers to simulate change
    const i = k < MUTUAL ? k : INSTAGRAM_FOLLOWING_CAP + (k - MUTUAL) + seed;
    return {
      title: '',
      media_list_data: [],
      string_list_data: [
        { href: `https://www.instagram.com/${name(i)}`, value: name(i), timestamp: 1_650_000_000 + i },
      ],
    };
  });
  return [
    {
      path: 'connections/followers_and_following/following.json',
      text: JSON.stringify({ relationships_following: following }),
    },
    { path: 'connections/followers_and_following/followers_1.json', text: JSON.stringify(followers) },
  ];
}

function time<T>(fn: () => T): [T, number] {
  const start = performance.now();
  const result = fn();
  return [result, performance.now() - start];
}

async function timeAsync<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  return [result, performance.now() - start];
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const mb = (bytes: number) => `${(bytes / 1e6).toFixed(1)} MB`;

async function run(total: number) {
  const database = createMemoryTabDatabase();
  const deps = {
    now: () => new Date(),
    download: () => undefined,
    tab: database.forTab('t'),
    lastSaved: memoryLastSaved(),
  };
  const store = makeStore(deps);
  const rows: [string, number, number][] = [];

  // A saved master from an earlier import, with 10% of accounts kept (built directly, not via thousands of
  // actions).
  const first = must(analyzeImport(exportTexts(total), null).prepared);
  const earlier = importExport(null, first.bundle, '2026-09-01T00:00:00.000Z').master;
  const keys = Object.keys(earlier.accounts);
  for (let i = 0; i < keys.length; i += 10) {
    const account = earlier.accounts[keys[i] ?? ''];
    if (account) {
      account.decision = { kind: DecisionKind.KEPT };
      account.review = { unavailable: false, tags: ['artist'], notes: '' };
    }
  }
  const masterText = stringifyMasterFile(toMasterFile({ ...earlier, lastSavedAt: '2026-09-02T00:00:00.000Z' }));

  // Second import: a newer export plus the saved master (the normal monthly flow).
  const inputs = [...exportTexts(total, 1_000), { path: 'unfollowism_master.json', text: masterText }];
  const [prepared, analyzeMs] = time(() => must(analyzeImport(inputs, null).prepared));
  const [, importMs] = await timeAsync(() => store.dispatch(importPrepared(prepared)).unwrap());
  await flush();

  // Once per import: sort order and imported counts (what the screen computes right after an import).
  const [, firstRenderMs] = time(() => {
    selectVisibleAccountKeys(store.getState());
    selectRelationshipStats(store.getState());
    selectScopeStats(store.getState());
    selectUnsavedAccountCount(store.getState());
    selectUnsavedDiff(store.getState());
  });

  // One edit, as when typing a note: reducer + the selectors the screen uses. Median of 20 keystrokes.
  const someone = keys[Math.floor(keys.length / 2)] ?? '';
  const keystrokes = Array.from(
    { length: 20 },
    (_, i) => time(() => store.dispatch(setNote({ username: someone, note: 'typing…'.slice(0, i % 8) })))[1],
  );
  store.dispatch(setNote({ username: someone, note: 'typing…' }));
  const editMs = keystrokes.sort((a, b) => a - b)[10] ?? 0;
  const [, listMs] = time(() => store.dispatch(setQuery('a'))); // the list refreshes only on filter changes like this
  const [, statsMs] = time(() => {
    selectRelationshipStats(store.getState());
    selectScopeStats(store.getState());
    selectUnsavedAccountCount(store.getState());
  });
  const [, diffMs] = time(() => selectUnsavedDiff(store.getState()));
  const [, persistMs] = await timeAsync(flush);

  const [, saveMs] = await timeAsync(() => store.dispatch(saveMaster()).unwrap());
  const reloaded = makeStore({ ...deps, tab: database.forTab('t') });
  const [, restoreMs] = await timeAsync(() => reloaded.dispatch(restoreTab()).unwrap());

  rows.push(
    ['read + classify export and master', analyzeMs, 0],
    ['import (merge, settle plans)', importMs, 0],
    ['first screen after import (sort + counts)', firstRenderMs, 0],
    ['one edit: reducer', editMs, 0],
    ['filter change: refresh list', listMs, 0],
    ['one edit: stats', statsMs, 0],
    ['one edit: unsaved changes list', diffMs, 0],
    ['one edit: storage write', persistMs, 0],
    ['save (serialize master)', saveMs, 0],
    ['reload restore', restoreMs, 0],
  );
  // eslint-disable-next-line no-console -- printing the timing table is what `npm run test:perf` is for
  console.log(`\n${total.toLocaleString()} accounts — master file ${mb(masterText.length)}`);
  for (const [label, ms] of rows) {
    // eslint-disable-next-line no-console -- see above
    console.log(`  ${label.padEnd(42)} ${ms.toFixed(1).padStart(9)} ms`);
  }

  expect(selectAccount(reloaded.getState(), someone)?.review.notes).toBe('typing…');
  return Object.fromEntries(rows.map(([label, ms]) => [label, ms]));
}

test('100k accounts: fast', { timeout: 120_000 }, async () => {
  const t = await run(100_000);
  expect(t['one edit: reducer']).toBeLessThan(5);
  expect(t['one edit: stats']).toBeLessThan(5);
  expect(t['one edit: unsaved changes list']).toBeLessThan(5);
  expect(t['one edit: storage write']).toBeLessThan(50);
  expect(t['filter change: refresh list']).toBeLessThan(50);
  expect(t['import (merge, settle plans)']).toBeLessThan(5_000);
  expect(t['save (serialize master)']).toBeLessThan(2_000);
  expect(t['reload restore']).toBeLessThan(3_000);
});

test('500k accounts: still works', { timeout: 600_000 }, async () => {
  const t = await run(500_000);
  expect(t['one edit: reducer']).toBeLessThan(25);
  expect(t['one edit: stats']).toBeLessThan(25);
  expect(t['import (merge, settle plans)']).toBeLessThan(30_000);
});
