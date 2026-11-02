import { createMemoryTabDatabase, type TabStore } from '@/entities/master/api/tabStore.ts';
import { must } from '@/entities/master/lib/__tests__/helpers.ts';
import {
  ACTION_TYPES,
  FOLLOW_CHANGES,
  IMPORT_PROBLEMS,
  PLAN_STATES,
  REVIEW_SCOPES,
  SESSION_CHANGES,
  DecisionFilter,
  DecisionKind,
  TAG_FILTER_KINDS,
  isKept,
  parseMaster,
  planOf,
  toMasterFile,
} from '@/entities/master/lib/index.ts';

import {
  LIST_VIEWS,
  applyFilters,
  clearFilters,
  setDecisionFilter,
  setQuery,
  setScope,
  setTagFilter,
  setView,
} from '../filtersSlice.ts';
import type { RootState } from '../index.ts';
import { selectListKeys } from '../listSlice.ts';
import {
  confirmRename,
  deleteTag,
  dismissRename,
  renameTag,
  resetChanges,
  keepInstead,
  setNote,
  setPlan,
  setKept,
  setUnavailable,
  toggleTag,
} from '../masterSlice.ts';
import { RETRY_DELAYS_MS } from '../persistence.ts';
import {
  selectAccount,
  selectIsDirty,
  selectFollowChangeCounts,
  selectPlanStats,
  selectTagCounts,
  selectTags,
  selectUnsavedDiff,
  selectUnsavedAccountCount,
  selectChangeSections,
  selectVisibleAccountKeys,
  selectMatchingCount,
  selectScopeTotals,
  selectTodoStartView,
} from '../selectors.ts';
import { STATUS_EVENTS } from '../statuses.ts';
import { importPrepared, restoreTab, saveMaster } from '../thunks.ts';

import {
  WRITES,
  deferred,
  flushPersistence,
  makeTestStore,
  prepared,
  recordingTab,
  type RecordedWrite,
} from './testStore.ts';

const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;

const write = (kind: RecordedWrite['kind'], keys: Partial<Omit<RecordedWrite, 'kind'>> = {}): RecordedWrite => ({
  kind,
  accounts: [],
  saved: [],
  removed: [],
  ...keys,
});

async function importedStore(options: Parameters<typeof makeTestStore>[0] = {}) {
  const t = makeTestStore(options);
  await t.store.dispatch(importPrepared(prepared())).unwrap();
  return t;
}

const account = (t: Awaited<ReturnType<typeof importedStore>>, key: string) =>
  must(selectAccount(t.store.getState(), key), key);

describe('import', () => {
  test('first import starts a dirty master whose baseline is the imported state', async () => {
    const { store } = await importedStore();
    const s = store.getState();
    expect(s.master.base?.lastImportAt).toBe('2026-10-27T12:00:00.000Z');
    expect(Object.keys(s.master.changed)).toEqual([]); // the imported master is the session baseline
    expect(selectIsDirty(s)).toBe(true);
    expect(s.master.status).toMatchObject({ type: STATUS_EVENTS.IMPORTED, isNewMaster: true });
  });

  test('re-importing the saved master with the same export is clean', async () => {
    const t = await importedStore();
    await t.store.dispatch(saveMaster()).unwrap();
    const saved = JSON.parse(must(t.downloads[0]).text) as unknown;

    const t2 = makeTestStore();
    await t2.store.dispatch(importPrepared(prepared({ master: saved }))).unwrap();
    expect(selectIsDirty(t2.store.getState())).toBe(false);
  });

  test('an invalid master is rejected with its problem and leaves state alone', async () => {
    const { store } = makeTestStore();
    const bad = prepared();
    const result = await store.dispatch(importPrepared({ ...bad, rawMaster: { accounts: [] } }));
    expect(result.payload).toEqual({ kind: IMPORT_PROBLEMS.NOT_A_MASTER });
    expect(store.getState().master.base).toBeNull();
    expect(store.getState().master.importStatus).toBe('idle');
  });

  test('a tag filter that no longer exists falls back to all tags', async () => {
    const t = makeTestStore();
    t.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'nonexistent' }));
    await t.store.dispatch(importPrepared(prepared())).unwrap();
    expect(t.store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.ALL });
  });
});

describe('edits', () => {
  test('kept: keeps and un-keeps; repeating the same value or unknown accounts are a no-op', async () => {
    const t = await importedStore();
    const r0 = t.store.getState().master.revision;
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    expect(account(t, 'bob').decision).toEqual({ kind: DecisionKind.KEPT });
    t.store.dispatch(setKept({ username: 'bob', kept: false }));
    expect(account(t, 'bob').decision).toBeUndefined();
    expect(t.store.getState().master.revision).toBe(r0 + 2);

    t.store.dispatch(setKept({ username: 'nobody', kept: true }));
    expect(t.store.getState().master.revision).toBe(r0 + 2);
  });

  test('unavailable: marking keeps an undecided account; clearing changes no decision', async () => {
    const t = await importedStore();
    t.store.dispatch(setUnavailable({ username: 'bob', unavailable: true }));
    expect(account(t, 'bob')).toMatchObject({ decision: { kind: DecisionKind.KEPT }, review: { unavailable: true } });
    t.store.dispatch(setUnavailable({ username: 'bob', unavailable: false }));
    expect(account(t, 'bob')).toMatchObject({ decision: { kind: DecisionKind.KEPT }, review: { unavailable: false } });

    // An account you already queued stays queued.
    t.store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    t.store.dispatch(setUnavailable({ username: 'alice', unavailable: true }));
    expect(planOf(account(t, 'alice'), UNFOLLOW)).toBe(PLAN_STATES.PLANNED);
  });

  test('plans: queuing decides; done and back; undoing the last plan undecides; ineligible is ignored', async () => {
    const t = await importedStore();
    const stats = () => selectPlanStats(t.store.getState());
    t.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    expect(planOf(account(t, 'bob'), UNFOLLOW)).toBe(PLAN_STATES.PLANNED);
    expect(account(t, 'bob').decision?.kind).toBe(DecisionKind.QUEUED);
    expect(stats().planned[UNFOLLOW]).toBe(1);

    t.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    expect(planOf(account(t, 'bob'), UNFOLLOW)).toBe(PLAN_STATES.DONE);
    expect(stats()).toMatchObject({ planned: { [UNFOLLOW]: 0 }, done: { [UNFOLLOW]: 1 } });

    t.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    expect(planOf(account(t, 'bob'), UNFOLLOW)).toBe(PLAN_STATES.PLANNED);
    t.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: null }));
    expect(planOf(account(t, 'bob'), UNFOLLOW)).toBeUndefined();
    expect(account(t, 'bob').decision).toBeUndefined();

    const r = t.store.getState().master.revision;
    // bob doesn't follow you
    t.store.dispatch(setPlan({ username: 'bob', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    t.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: null })); // nothing to cancel
    expect(t.store.getState().master.revision).toBe(r);
  });

  test('Keep clears plans; queuing a kept account turns it into queued', async () => {
    const t = await importedStore();
    t.store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    t.store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    t.store.dispatch(setKept({ username: 'alice', kept: true }));
    expect(account(t, 'alice').decision).toEqual({ kind: DecisionKind.KEPT });
    expect(selectPlanStats(t.store.getState()).planned).toEqual({ [UNFOLLOW]: 0, [REMOVE_FOLLOWER]: 0 });

    t.store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    expect(account(t, 'alice').decision).toEqual({
      kind: DecisionKind.QUEUED,
      plans: { [REMOVE_FOLLOWER]: PLAN_STATES.PLANNED },
    });
  });

  test('Keep instead (To do) drops one plan; with none left the account is Kept', async () => {
    const t = await importedStore();
    t.store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    t.store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.DONE }));

    t.store.dispatch(keepInstead({ username: 'alice', type: UNFOLLOW }));
    expect(account(t, 'alice').decision).toEqual({
      kind: DecisionKind.QUEUED,
      plans: { [REMOVE_FOLLOWER]: PLAN_STATES.DONE },
    });
    t.store.dispatch(keepInstead({ username: 'alice', type: REMOVE_FOLLOWER }));
    expect(account(t, 'alice').decision).toEqual({ kind: DecisionKind.KEPT });

    const r = t.store.getState().master.revision;
    t.store.dispatch(keepInstead({ username: 'alice', type: UNFOLLOW })); // nothing queued: no-op
    expect(t.store.getState().master.revision).toBe(r);
  });

  test('tags toggle and notes only count real changes', async () => {
    const t = await importedStore();
    t.store.dispatch(toggleTag({ username: 'carol', tag: 'artist' }));
    expect(account(t, 'carol').review.tags).toEqual(['artist']);
    t.store.dispatch(toggleTag({ username: 'carol', tag: 'artist' }));
    expect(account(t, 'carol').review.tags).toEqual([]);

    t.store.dispatch(setNote({ username: 'carol', note: 'hi' }));
    const r = t.store.getState().master.revision;
    t.store.dispatch(setNote({ username: 'carol', note: 'hi' }));
    expect(t.store.getState().master.revision).toBe(r);
  });
});

describe('save', () => {
  test('downloads a master that re-imports unchanged; the session baseline is kept', async () => {
    const t = await importedStore();
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    t.setNow('2026-10-27T14:05:09.000Z');
    await t.store.dispatch(saveMaster()).unwrap();

    const file = must(t.downloads[0]);
    expect(file.filename).toMatch(/^unfollowism_master_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
    const saved = JSON.parse(file.text) as { lastSavedAt: string };
    expect(saved.lastSavedAt).toBe('2026-10-27T14:05:09.000Z');
    expect(toMasterFile(parseMaster(saved))).toEqual(saved); // the file is exactly the saved format

    const s = t.store.getState();
    expect(selectIsDirty(s)).toBe(false);
    expect(selectUnsavedDiff(s)).toEqual([]); // saved: nothing left to list
    expect(t.lastSaved.get()).toBe('2026-10-27T14:05:09.000Z');
  });

  test('the unsaved changes list covers only what came after the last save', async () => {
    const t = await importedStore();
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    await t.store.dispatch(saveMaster()).unwrap();
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    t.store.dispatch(setNote({ username: 'carol', note: 'x' }));
    expect(selectUnsavedDiff(t.store.getState()).map(a => [a.username, a.changes.map(c => c.type)])).toEqual([
      ['bob', [SESSION_CHANGES.TAG_ADDED]],
      ['carol', [SESSION_CHANGES.NOTE_EDITED]],
    ]);
  });

  test('an edit that was undone leaves nothing unsaved', async () => {
    const t = await importedStore();
    await t.store.dispatch(saveMaster()).unwrap();
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectIsDirty(t.store.getState())).toBe(true);
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectIsDirty(t.store.getState())).toBe(false);
  });

  test('an import that differs from its file stays unsaved without any edit', async () => {
    const t = makeTestStore();
    await t.store.dispatch(importPrepared(prepared())).unwrap(); // no master: a new one, not downloaded yet
    expect(selectIsDirty(t.store.getState())).toBe(true);
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectIsDirty(t.store.getState())).toBe(true);
  });

  test('edits made while saving stay unsaved', async () => {
    const gate = deferred();
    const t = makeTestStore({ download: () => gate.promise });
    await t.store.dispatch(importPrepared(prepared())).unwrap();

    const saving = t.store.dispatch(saveMaster());
    t.store.dispatch(setNote({ username: 'bob', note: 'typed during save' }));
    gate.resolve();
    await saving;

    expect(selectIsDirty(t.store.getState())).toBe(true);
    expect(t.store.getState().master.status).toEqual({ type: STATUS_EVENTS.SAVED });
  });

  test('a second save while one is running is ignored', async () => {
    const gate = deferred();
    const calls: string[] = [];
    const t = makeTestStore({
      download: name => {
        calls.push(name);
        return gate.promise;
      },
    });
    await t.store.dispatch(importPrepared(prepared())).unwrap();

    const first = t.store.dispatch(saveMaster());
    await t.store.dispatch(saveMaster());
    gate.resolve();
    await first;
    expect(calls).toHaveLength(1);
  });

  test('a failed download keeps its message, marks nothing saved, and saving works again', async () => {
    let fail = true;
    const t = makeTestStore({
      download: () => {
        if (fail) {
          throw new Error('Download blocked');
        }
      },
    });
    await t.store.dispatch(importPrepared(prepared())).unwrap();

    await t.store.dispatch(saveMaster());
    expect(t.store.getState().master.status).toEqual({ type: STATUS_EVENTS.SAVE_FAILED, reason: 'Download blocked' });
    expect(selectIsDirty(t.store.getState())).toBe(true);

    fail = false;
    await t.store.dispatch(saveMaster()).unwrap();
    expect(selectIsDirty(t.store.getState())).toBe(false);
  });

  test('saving with nothing loaded does nothing', async () => {
    const { store, downloads } = makeTestStore();
    const result = await store.dispatch(saveMaster());
    expect(result.meta).toMatchObject({ condition: true });
    expect(downloads).toEqual([]);
    expect(store.getState().master.status).toBeNull();
  });
});

describe('reset changes', () => {
  const review = (t: Awaited<ReturnType<typeof importedStore>>, key: string) => account(t, key).review;
  const kept = (t: Awaited<ReturnType<typeof importedStore>>, key: string) => isKept(account(t, key));

  test("goes back to the last save, with that save's status", async () => {
    const t = await importedStore();
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    await t.store.dispatch(saveMaster()).unwrap();
    const savedStatus = t.store.getState().master.status;

    t.store.dispatch(setNote({ username: 'bob', note: 'after save' }));
    t.store.dispatch(setKept({ username: 'carol', kept: true }));
    expect(selectUnsavedAccountCount(t.store.getState())).toBe(2);

    t.store.dispatch(resetChanges());
    const s = t.store.getState();
    expect(kept(t, 'bob')).toBe(true);
    expect(review(t, 'bob').notes).toBe('');
    expect(kept(t, 'carol')).toBe(false);
    expect(selectIsDirty(s)).toBe(false);
    expect(selectUnsavedAccountCount(s)).toBe(0);
    expect(s.master.status).toEqual(savedStatus);
    expect(selectUnsavedDiff(s)).toEqual([]); // back to the save: nothing unsaved
  });

  test('without a save since the import, goes back to the import', async () => {
    const t = makeTestStore();
    await t.store.dispatch(importPrepared(prepared())).unwrap();
    await t.store.dispatch(saveMaster()).unwrap();
    const saved = JSON.parse(must(t.downloads[0]).text) as unknown;

    const t2 = makeTestStore();
    await t2.store.dispatch(importPrepared(prepared({ master: saved }))).unwrap(); // clean import
    const importStatus = t2.store.getState().master.status;
    t2.store.dispatch(setKept({ username: 'bob', kept: true }));
    t2.store.dispatch(resetChanges());

    const s = t2.store.getState();
    expect(kept(t2, 'bob')).toBe(false);
    expect(Object.keys(s.master.changed)).toEqual([]);
    expect(selectIsDirty(s)).toBe(false);
    expect(s.master.status).toEqual(importStatus);
  });

  test('an import that was never saved stays unsaved after a reset', async () => {
    const t = await importedStore(); // a new master: not in any file yet
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    t.store.dispatch(resetChanges());
    expect(kept(t, 'bob')).toBe(false);
    expect(selectIsDirty(t.store.getState())).toBe(true);
  });

  test('Reset after a save undoes edits made while saving', async () => {
    const gate = deferred();
    const t = makeTestStore({ download: () => gate.promise });
    await t.store.dispatch(importPrepared(prepared())).unwrap();
    const saving = t.store.dispatch(saveMaster());
    t.store.dispatch(setNote({ username: 'bob', note: 'typed during save' }));
    gate.resolve();
    await saving;

    t.store.dispatch(resetChanges());
    expect(t.store.getState().master.status).toEqual({ type: STATUS_EVENTS.SAVED });
    expect(review(t, 'bob').notes).toBe('');
  });

  test('accounts changed back to their saved state are not counted', async () => {
    const t = await importedStore();
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    t.store.dispatch(setNote({ username: 'carol', note: 'x' }));
    t.store.dispatch(setNote({ username: 'carol', note: '' }));
    expect(selectUnsavedAccountCount(t.store.getState())).toBe(1);
  });

  test('a tag taken off and put back is not counted, though it is now last', async () => {
    const t = await importedStore();
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'a' }));
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'b' }));
    await t.store.dispatch(saveMaster()).unwrap();
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'a' }));
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'a' }));
    expect(account(t, 'bob').review.tags).toEqual(['b', 'a']);
    expect(selectUnsavedAccountCount(t.store.getState())).toBe(0);
    expect(selectUnsavedDiff(t.store.getState())).toEqual([]);
  });

  test('works after a reload', async () => {
    const t = await importedStore();
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    await t.store.dispatch(saveMaster()).unwrap();
    t.store.dispatch(setNote({ username: 'bob', note: 'after save' }));
    t.store.dispatch(setNote({ username: 'carol', note: 'after save' }));
    await flushPersistence();

    const reloaded = makeTestStore({ tab: t.tab });
    await reloaded.store.dispatch(restoreTab());
    expect(selectUnsavedAccountCount(reloaded.store.getState())).toBe(2);
    reloaded.store.dispatch(resetChanges());
    expect(kept(reloaded, 'bob')).toBe(true);
    expect(review(reloaded, 'bob').notes).toBe('');
    expect(review(reloaded, 'carol').notes).toBe('');
    expect(selectIsDirty(reloaded.store.getState())).toBe(false);
    await flushPersistence();

    const again = makeTestStore({ tab: t.tab }); // and the reset itself survives a reload
    await again.store.dispatch(restoreTab());
    expect(review(again, 'carol').notes).toBe('');
    expect(selectIsDirty(again.store.getState())).toBe(false);
  });
});

describe('tags', () => {
  test('rename and delete touch only tagged accounts; the filter follows; Reset changes undoes them', async () => {
    const t = await importedStore();
    t.store.dispatch(toggleTag({ username: 'alice', tag: 'dog' }));
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'artist' }));
    await t.store.dispatch(saveMaster()).unwrap();
    expect(selectTags(t.store.getState())).toEqual(['artist', 'dog']);

    t.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'dog' }));
    const r = t.store.getState().master.revision;
    t.store.dispatch(renameTag({ from: 'dog', to: 'artist' })); // merge
    expect(account(t, 'alice').review.tags).toEqual(['artist']);
    expect(account(t, 'bob').review.tags).toEqual(['artist']);
    expect(selectTagCounts(t.store.getState()).artist).toBe(2);
    expect(selectTagCounts(t.store.getState()).dog ?? 0).toBe(0);
    expect(selectTags(t.store.getState())).toEqual(['artist']);
    expect(t.store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.TAG, tag: 'artist' });
    expect(t.store.getState().master.revision).toBe(r + 1); // one change, however many accounts
    expect(t.store.getState().master.changed.carol).toBeUndefined(); // carol has no tags: not edited

    t.store.dispatch(deleteTag({ tag: 'artist' }));
    expect(selectTags(t.store.getState())).toEqual([]);
    expect(t.store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.ALL }); // its tag is gone

    t.store.dispatch(resetChanges());
    expect(selectTags(t.store.getState())).toEqual(['artist', 'dog']);
    expect(account(t, 'bob').review.tags).toEqual(['dog', 'artist']);
  });

  test('removing a tag from its last account makes it disappear, and the filter resets', async () => {
    const t = await importedStore();
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    t.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'dog' }));
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectTags(t.store.getState())).toEqual([]);
    expect(t.store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.ALL });
  });
});

describe('filters', () => {
  test('the Filter sheet applies list, tag and decision at once; Clear all keeps the list', async () => {
    const t = await importedStore();
    t.store.dispatch(toggleTag({ username: 'alice', tag: 'artist' }));
    t.store.dispatch(setQuery('a'));
    t.store.dispatch(
      applyFilters({
        scope: REVIEW_SCOPES.MUTUAL,
        tag: { kind: TAG_FILTER_KINDS.TAG, tag: 'artist' },
        decision: DecisionFilter.NEEDS_DECISION,
      }),
    );
    expect(t.store.getState().filters).toMatchObject({
      scope: REVIEW_SCOPES.MUTUAL,
      tag: { kind: TAG_FILTER_KINDS.TAG, tag: 'artist' },
      decision: DecisionFilter.NEEDS_DECISION,
      query: 'a',
    });
    expect(selectListKeys(t.store.getState())).toEqual(['alice']);

    t.store.dispatch(clearFilters());
    expect(t.store.getState().filters).toMatchObject({
      scope: REVIEW_SCOPES.MUTUAL,
      tag: { kind: TAG_FILTER_KINDS.ALL },
      decision: DecisionFilter.ANY,
      query: 'a',
    });
  });
});

describe('list refresh', () => {
  test('the shown list changes on filter change, import, restore and resets, never on an edit', async () => {
    const t = await importedStore();
    const shown = () => selectListKeys(t.store.getState());
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // import

    t.store.dispatch(setDecisionFilter(DecisionFilter.NEEDS_DECISION));
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // an edit doesn't move cards
    t.store.dispatch(setQuery(''));
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // same filters: same list
    t.store.dispatch(setQuery('a'));
    expect(shown()).toEqual(['alice', 'carol']);

    t.store.dispatch(setQuery(''));
    t.store.dispatch(resetChanges());
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // bob needs a decision again
    await flushPersistence();

    const reloaded = makeTestStore({ tab: t.tab });
    await reloaded.store.dispatch(restoreTab());
    expect(selectListKeys(reloaded.store.getState())).toEqual(['alice', 'bob', 'carol']);
  });
});

describe('reload safety net', () => {
  test('a reload puts back the work, including the session baseline', async () => {
    const t = await importedStore();
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    t.store.dispatch(toggleTag({ username: 'bob', tag: 'artist' }));
    await flushPersistence();

    const reloaded = makeTestStore({ tab: t.tab });
    await reloaded.store.dispatch(restoreTab());
    const before = t.store.getState();
    const after = reloaded.store.getState();

    expect(selectIsDirty(after)).toBe(true);
    expect(after.master.revision).toBe(before.master.revision);
    expect(JSON.parse(JSON.stringify(after.master.base))).toEqual(JSON.parse(JSON.stringify(before.master.base)));
    expect(JSON.parse(JSON.stringify(after.master.changed))).toEqual(JSON.parse(JSON.stringify(before.master.changed)));
    expect(selectUnsavedDiff(after)).toEqual(selectUnsavedDiff(before));
  });

  test('what the import found besides the master (compare numbers, done plans) survives a reload', async () => {
    const t = await importedStore();
    t.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    await t.store.dispatch(saveMaster()).unwrap();
    const master: unknown = JSON.parse(must(t.downloads[0]).text);
    await t.store.dispatch(importPrepared(prepared({ following: [['Alice'], ['carol']], master }))).unwrap();
    expect(t.store.getState().master.importFacts).toEqual({
      followingBefore: 3,
      followersBefore: 2,
      completedPlans: { bob: [UNFOLLOW] },
    });
    await flushPersistence();

    const reloaded = makeTestStore({ tab: t.tab });
    await reloaded.store.dispatch(restoreTab());
    expect(reloaded.store.getState().master.importFacts).toEqual(t.store.getState().master.importFacts);
  });

  test('a __proto__ account and tag survive edits, a save and a reload', async () => {
    const t = makeTestStore();
    await t.store.dispatch(importPrepared(prepared({ following: [['__proto__'], ['bob']] }))).unwrap();
    t.store.dispatch(toggleTag({ username: '__proto__', tag: '__proto__' }));
    expect(selectTags(t.store.getState())).toEqual(['__proto__']);
    expect(selectTagCounts(t.store.getState())['__proto__']).toBe(1);

    await t.store.dispatch(saveMaster()).unwrap();
    expect(Object.keys(parseMaster(JSON.parse(must(t.downloads[0]).text)).accounts)).toContain('__proto__');
    t.store.dispatch(setNote({ username: '__proto__', note: 'after save' }));
    await flushPersistence();

    const reloaded = makeTestStore({ tab: t.tab });
    await reloaded.store.dispatch(restoreTab());
    expect(account(reloaded, '__proto__').review).toMatchObject({ tags: ['__proto__'], notes: 'after save' });
    reloaded.store.dispatch(resetChanges());
    expect(account(reloaded, '__proto__').review).toMatchObject({ tags: ['__proto__'], notes: '' });
  });

  test('a new tab (nothing stored) starts empty', async () => {
    const { store } = makeTestStore();
    expect(await store.dispatch(restoreTab()).unwrap()).toBeNull();
    expect(store.getState().master.base).toBeNull();
  });

  test('import stores the master once; each edit stores only the accounts it changed', async () => {
    const { tab, writes } = recordingTab();
    const t = makeTestStore({ tab });
    await t.store.dispatch(importPrepared(prepared())).unwrap();
    await flushPersistence();
    expect(writes).toEqual([write(WRITES.REPLACE)]);

    t.store.dispatch(setNote({ username: 'bob', note: 'x' }));
    await flushPersistence();
    t.store.dispatch(setKept({ username: 'alice', kept: true }));
    t.store.dispatch(setKept({ username: 'carol', kept: true }));
    await flushPersistence();
    expect(writes.slice(1)).toEqual([
      write(WRITES.UPDATE, { accounts: ['bob'] }),
      write(WRITES.UPDATE, { accounts: ['alice'] }), // carol arrived during this write…
      write(WRITES.UPDATE, { accounts: ['carol'] }), // …and was folded into one follow-up
    ]);

    await t.store.dispatch(saveMaster()).unwrap();
    await flushPersistence();
    // the saved versions, for Reset after a reload
    expect(writes.at(-1)).toEqual(write(WRITES.UPDATE, { saved: ['bob', 'alice', 'carol'] }));

    t.store.dispatch(setNote({ username: 'dave', note: 'y' }));
    await flushPersistence();
    t.store.dispatch(resetChanges());
    await flushPersistence();
    expect(writes.slice(-2)).toEqual([
      write(WRITES.UPDATE, { accounts: ['dave'] }),
      write(WRITES.UPDATE, { removed: ['dave'] }),
    ]);
  });

  test('restoring after a reload writes nothing', async () => {
    const first = await importedStore();
    first.store.dispatch(setKept({ username: 'bob', kept: true }));
    await flushPersistence();

    const { tab, writes } = recordingTab(first.tab);
    const reloaded = makeTestStore({ tab });
    await reloaded.store.dispatch(restoreTab());
    await flushPersistence();
    expect(writes).toEqual([]);

    reloaded.store.dispatch(setNote({ username: 'bob', note: 'after reload' }));
    await flushPersistence();
    expect(writes).toEqual([write(WRITES.UPDATE, { accounts: ['bob'] })]);
  });

  test('a new import replaces what was stored for the tab', async () => {
    const t = await importedStore();
    t.store.dispatch(setNote({ username: 'bob', note: 'old session' }));
    await flushPersistence();
    await t.store.dispatch(importPrepared(prepared({ following: [['zed']], followers: [['zed']] }))).unwrap();
    await flushPersistence();

    const stored = must(await t.tab.load());
    expect(Object.keys(stored.changed)).toEqual([]);
    expect(Object.keys((stored.base as { accounts: object }).accounts)).toEqual(['zed']);
  });

  test('unusable stored data is reported, and the next import clears the report', async () => {
    const t = makeTestStore();
    await t.tab.replace(
      { version: 1, lastImportAt: 'x', accounts: { bob: { username: '' } } },
      {
        revision: 1,
        savedRevision: 0,
        storedAt: 'x',
        importFacts: { followingBefore: 0, followersBefore: 0, completedPlans: {} },
      },
      { changed: {}, saved: {} },
    );
    await t.store.dispatch(restoreTab());
    expect(t.store.getState().master).toMatchObject({ base: null, restoreFailed: true });

    await t.store.dispatch(importPrepared(prepared())).unwrap();
    expect(t.store.getState().master.restoreFailed).toBe(false);
  });

  test('a storage read that fails is reported; a new tab is not', async () => {
    const unreadable = makeTestStore({
      tab: { ...createMemoryTabDatabase().forTab('t'), load: () => Promise.reject(new Error('no idb')) },
    });
    await unreadable.store.dispatch(restoreTab());
    expect(unreadable.store.getState().master.restoreFailed).toBe(true);

    const fresh = makeTestStore();
    await fresh.store.dispatch(restoreTab());
    expect(fresh.store.getState().master.restoreFailed).toBe(false);
  });

  test('storage failures are surfaced, not swallowed, and saving still works', async () => {
    const failing: TabStore = {
      durable: true,
      load: () => Promise.reject(new Error('no idb')),
      replace: () => Promise.reject(new Error('quota')),
      update: () => Promise.reject(new Error('quota')),
    };
    const t = await importedStore({ tab: failing });
    await flushPersistence();
    expect(t.store.getState().master.persistenceFailed).toBe(true);
    await t.store.dispatch(restoreTab());
    expect(t.store.getState().master.restoreFailed).toBe(false); // the work is already open: nothing to warn about
    await expect(t.store.dispatch(saveMaster()).unwrap()).resolves.toBeTruthy();
  });
});

describe('storage write failures', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A tab store whose writes fail while `failing.on` is set; counts every write attempt. */
  function flakyTab(inner: TabStore = createMemoryTabDatabase().forTab('t')) {
    const failing = { on: false, attempts: 0 };
    const attempt = <T>(write: () => Promise<T>) => {
      failing.attempts += 1;
      return failing.on ? Promise.reject(new Error('quota')) : write();
    };
    const tab: TabStore = {
      durable: true,
      load: () => inner.load(),
      replace: (...args) => attempt(() => inner.replace(...args)),
      update: (...args) => attempt(() => inner.update(...args)),
    };
    return { tab, failing };
  }

  /** Imports with real timers (the import waits for a paint), then switches to fake ones to step through retries. */
  async function importedWithFakeTimers(tab: TabStore) {
    const t = makeTestStore({ tab });
    await t.store.dispatch(importPrepared(prepared())).unwrap();
    await flushPersistence();
    vi.useFakeTimers();
    return t;
  }

  const storedNote = async (tab: TabStore, key: string) =>
    (must(await tab.load()).changed[key] as { review?: { notes: string } } | undefined)?.review?.notes;

  test('a failed write is retried by itself, and the warning clears once storage works again', async () => {
    const { tab, failing } = flakyTab();
    const t = await importedWithFakeTimers(tab);

    failing.on = true;
    t.store.dispatch(setNote({ username: 'bob', note: 'my last edit' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.store.getState().master.persistenceFailed).toBe(true);

    failing.on = false; // no further edit: the retry alone has to store it
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(t.store.getState().master.persistenceFailed).toBe(false);
    expect(await storedNote(tab, 'bob')).toBe('my last edit');
  });

  test('a tab whose stored data was deleted gets it rebuilt', async () => {
    const db = createMemoryTabDatabase();
    const { tab } = flakyTab(db.forTab('t'));
    const t = await importedWithFakeTimers(tab);

    await db.deleteTab('t');
    t.store.dispatch(setNote({ username: 'bob', note: 'after the loss' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.store.getState().master.persistenceFailed).toBe(true); // an update needs the stored tab

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]); // the retry writes everything again
    expect(t.store.getState().master.persistenceFailed).toBe(false);
    expect(must(await tab.load()).base).toMatchObject({ accounts: { bob: { username: 'bob' } } });
    expect(await storedNote(tab, 'bob')).toBe('after the loss');
  });

  test('after the last retry it waits for the next change', async () => {
    const { tab, failing } = flakyTab();
    const t = await importedWithFakeTimers(tab);

    failing.on = true;
    failing.attempts = 0;
    t.store.dispatch(setNote({ username: 'bob', note: 'x' }));
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0) * 2);
    expect(failing.attempts).toBe(1 + RETRY_DELAYS_MS.length);

    failing.on = false;
    t.store.dispatch(setNote({ username: 'bob', note: 'y' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(t.store.getState().master.persistenceFailed).toBe(false);
    expect(await storedNote(tab, 'bob')).toBe('y');
  });
});

describe('renames', () => {
  const lostFollowers = (state: RootState) => selectChangeSections(state)[FOLLOW_CHANGES.LOST_FOLLOWERS];
  /**
   * carol (follows me, tagged, noted, queued for removal) is saved, then shows up as carol_2 with the same
   * date.
   */
  async function renamedStore() {
    const t = makeTestStore();
    await t.store
      .dispatch(
        importPrepared(
          prepared({
            following: [
              ['alice', 101],
              ['bob', 102],
            ],
            followers: [
              ['alice', 201],
              ['carol', 203],
            ],
          }),
        ),
      )
      .unwrap();
    t.store.dispatch(toggleTag({ username: 'carol', tag: 'artist' }));
    t.store.dispatch(setNote({ username: 'carol', note: 'old note' }));
    t.store.dispatch(setPlan({ username: 'carol', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    await t.store.dispatch(saveMaster()).unwrap();
    const master: unknown = JSON.parse(must(t.downloads[0]).text);
    t.setNow('2026-10-28T12:00:00.000Z');
    await t.store
      .dispatch(
        importPrepared(
          prepared({
            following: [
              ['alice', 101],
              ['bob', 102],
            ],
            followers: [
              ['alice', 201],
              ['carol_2', 203],
            ],
            master,
          }),
        ),
      )
      .unwrap();
    return t;
  }

  test("the import suggests the rename and doesn't count its plan as done", async () => {
    const t = await renamedStore();
    const state = t.store.getState();
    expect(account(t, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });
    expect(state.master.status).toMatchObject({ summary: { plans: { completed: { [REMOVE_FOLLOWER]: 0 } } } });
    expect(lostFollowers(state)).toEqual(['carol']);
    expect(selectScopeTotals(state)[REVIEW_SCOPES.ALL_ACCOUNTS]).toBe(4); // alice, bob, carol (past), carol_2
  });

  test('confirming moves the work to the new name, removes the old account, and saves without it', async () => {
    const t = await renamedStore();
    t.store.dispatch(confirmRename({ from: 'carol' }));
    const state = t.store.getState();

    expect(selectAccount(state, 'carol')).toBeUndefined();
    expect(account(t, 'carol_2')).toMatchObject({
      decision: { kind: DecisionKind.QUEUED, plans: { [REMOVE_FOLLOWER]: PLAN_STATES.PLANNED } },
      review: { tags: ['artist'], notes: 'old note' },
    });
    expect(lostFollowers(state)).toEqual([]); // the old account leaves No longer follow you
    expect(selectScopeTotals(state)[REVIEW_SCOPES.ALL_ACCOUNTS]).toBe(3); // carol is gone, carol_2 stays
    expect(selectFollowChangeCounts(state)[FOLLOW_CHANGES.LOST_FOLLOWERS]).toBe(0);
    expect(selectTagCounts(state).artist).toBe(1);
    expect(selectPlanStats(state)[PLAN_STATES.PLANNED][REMOVE_FOLLOWER]).toBe(1);
    expect(selectUnsavedAccountCount(state)).toBe(2);
    expect(selectUnsavedDiff(state).find(entry => entry.username === 'carol')?.changes).toEqual([
      { type: SESSION_CHANGES.ACCOUNT_REMOVED },
    ]);

    await t.store.dispatch(saveMaster()).unwrap();
    const saved = parseMaster(JSON.parse(must(t.downloads[1]).text));
    expect(Object.keys(saved.accounts).sort()).toEqual(['alice', 'bob', 'carol_2']);
    expect(saved.accounts.carol_2?.review.tags).toEqual(['artist']);
  });

  test('Reset changes brings the old account back, with its suggestion', async () => {
    const t = await renamedStore();
    t.store.dispatch(confirmRename({ from: 'carol' }));
    t.store.dispatch(resetChanges());
    expect(account(t, 'carol')).toMatchObject({ review: { tags: ['artist'] }, renameSuggestion: { to: 'carol_2' } });
    expect(account(t, 'carol_2').review.tags).toEqual([]);
    expect(lostFollowers(t.store.getState())).toEqual(['carol']);
  });

  test('Not a rename is an ordinary edit: unsaved, listed, undone by Reset', async () => {
    const t = await renamedStore();
    t.store.dispatch(dismissRename({ from: 'carol' }));
    const state = t.store.getState();
    expect(account(t, 'carol').renameSuggestion).toBeUndefined();
    expect(account(t, 'carol').review.tags).toEqual(['artist']);
    expect(selectUnsavedAccountCount(state)).toBe(1);
    expect(selectUnsavedDiff(state)).toEqual([
      { username: 'carol', changes: [{ type: SESSION_CHANGES.RENAME_DISMISSED }] },
    ]);
    expect(selectFollowChangeCounts(state)[FOLLOW_CHANGES.LOST_FOLLOWERS]).toBe(1); // still lost since the last save

    t.store.dispatch(resetChanges());
    expect(account(t, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });
  });

  test('an open suggestion survives a reload, and so does a confirmed rename', async () => {
    const t = await renamedStore();
    await flushPersistence();
    const reloaded = makeTestStore({ tab: t.tab });
    await reloaded.store.dispatch(restoreTab());
    expect(account(reloaded, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });

    reloaded.store.dispatch(confirmRename({ from: 'carol' }));
    await flushPersistence();
    const again = makeTestStore({ tab: t.tab });
    await again.store.dispatch(restoreTab());
    expect(selectAccount(again.store.getState(), 'carol')).toBeUndefined();
    expect(account(again, 'carol_2').review.notes).toBe('old note');
    again.store.dispatch(resetChanges()); // and the removal can still be undone
    expect(account(again, 'carol').review.notes).toBe('old note');
  });

  test('an open suggestion survives Save master and the next import, and stays in Lost followers', async () => {
    const t = await renamedStore();
    await t.store.dispatch(saveMaster()).unwrap();
    const master: unknown = JSON.parse(must(t.downloads[1]).text);
    t.setNow('2026-10-29T12:00:00.000Z');
    await t.store
      .dispatch(
        importPrepared(
          prepared({
            following: [
              ['alice', 101],
              ['bob', 102],
            ],
            followers: [
              ['alice', 201],
              ['carol_2', 203],
            ],
            master,
          }),
        ),
      )
      .unwrap();
    expect(account(t, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });
    expect(lostFollowers(t.store.getState())).toEqual(['carol']);
  });
});

describe('selectors', () => {
  test('To do opens on the first tab with work left, else the first with done plans, else Unfollow', async () => {
    const t = await importedStore();
    const start = () => selectTodoStartView(t.store.getState());
    expect(start()).toBe(LIST_VIEWS.TO_UNFOLLOW); // nothing queued
    t.store.dispatch(setPlan({ username: 'dave', type: REMOVE_FOLLOWER, state: PLAN_STATES.DONE }));
    expect(start()).toBe(LIST_VIEWS.TO_REMOVE); // only done plans, all in Remove follower
    t.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    expect(start()).toBe(LIST_VIEWS.TO_UNFOLLOW); // done plans in both: the first
    t.store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    expect(start()).toBe(LIST_VIEWS.TO_REMOVE); // work left wins over done
  });

  test('visible accounts follow scope, decision, tag and search, sorted by username', async () => {
    const t = await importedStore();
    const keys = () => selectVisibleAccountKeys(t.store.getState());
    expect(keys()).toEqual(['alice', 'bob', 'carol']); // I follow

    t.store.dispatch(setScope(REVIEW_SCOPES.FOLLOWERS));
    expect(keys()).toEqual(['alice', 'dave']);
    t.store.dispatch(setScope(REVIEW_SCOPES.ALL_CURRENT));
    t.store.dispatch(toggleTag({ username: 'dave', tag: 'artist' }));
    t.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'artist' }));
    expect(keys()).toEqual(['dave']);
    t.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.UNTAGGED }));
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    t.store.dispatch(setDecisionFilter(DecisionFilter.NEEDS_DECISION));
    expect(keys()).toEqual(['alice', 'carol']);
    t.store.dispatch(setQuery(' CAR '));
    expect(keys()).toEqual(['carol']);
  });

  test('Changes sections list what changed since the imported master was saved, regardless of scope', async () => {
    const t = await importedStore();
    await t.store.dispatch(saveMaster()).unwrap(); // saved at 12:00
    const saved = JSON.parse(must(t.downloads[0]).text) as unknown;
    const afterSave = Date.parse('2026-10-27T12:30:00.000Z') / 1000;
    t.setNow('2026-10-27T13:00:00.000Z');
    await t.store
      .dispatch(
        importPrepared(
          prepared({
            master: saved,
            following: [['alice'], ['erin', afterSave]],
            followers: [['alice'], ['erin', afterSave]],
          }),
        ),
      )
      .unwrap();

    t.store.dispatch(setScope(REVIEW_SCOPES.FOLLOWERS)); // the Review list doesn't narrow Changes
    expect(selectChangeSections(t.store.getState())).toEqual({
      [FOLLOW_CHANGES.NEW_FOLLOWS]: ['erin'],
      [FOLLOW_CHANGES.UNFOLLOWED]: ['bob', 'carol'],
      [FOLLOW_CHANGES.NEW_FOLLOWERS]: ['erin'],
      [FOLLOW_CHANGES.LOST_FOLLOWERS]: ['dave'],
    });
    expect(selectFollowChangeCounts(t.store.getState())).toEqual({
      [FOLLOW_CHANGES.NEW_FOLLOWS]: 1,
      [FOLLOW_CHANGES.UNFOLLOWED]: 2,
      [FOLLOW_CHANGES.NEW_FOLLOWERS]: 1,
      [FOLLOW_CHANGES.LOST_FOLLOWERS]: 1,
    });
  });

  test('To do tabs list their plans, queued first, then done; Review filters do not apply', async () => {
    const t = await importedStore();
    t.store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    t.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    t.store.dispatch(setPlan({ username: 'carol', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    t.store.dispatch(setPlan({ username: 'dave', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    t.store.dispatch(setQuery('zzz')); // matches nobody
    t.store.dispatch(setView(LIST_VIEWS.TO_UNFOLLOW));
    expect(selectVisibleAccountKeys(t.store.getState())).toEqual(['bob', 'carol', 'alice']);
    t.store.dispatch(setView(LIST_VIEWS.TO_REMOVE));
    expect(selectVisibleAccountKeys(t.store.getState())).toEqual(['dave']);
  });

  test('editing one account keeps the list array and other accounts referentially stable', async () => {
    const t = await importedStore();
    const before = t.store.getState();
    t.store.dispatch(setNote({ username: 'bob', note: 'x' }));
    const after = t.store.getState();
    expect(selectVisibleAccountKeys(after)).toBe(selectVisibleAccountKeys(before));
    expect(selectAccount(after, 'alice')).toBe(selectAccount(before, 'alice'));
    expect(selectAccount(after, 'bob')).not.toBe(selectAccount(before, 'bob'));
  });

  test('per-list totals count each list whatever the other filters; edits never change them', async () => {
    const t = await importedStore(); // following Alice, bob, carol; followers alice, dave
    const totals = {
      [REVIEW_SCOPES.FOLLOWING]: 3,
      [REVIEW_SCOPES.FOLLOWERS]: 2,
      [REVIEW_SCOPES.MUTUAL]: 1,
      [REVIEW_SCOPES.NOT_FOLLOWING_BACK]: 2,
      [REVIEW_SCOPES.FOLLOWS_YOU_ONLY]: 1,
      [REVIEW_SCOPES.ALL_CURRENT]: 4,
      [REVIEW_SCOPES.ALL_ACCOUNTS]: 4,
    };
    expect(selectScopeTotals(t.store.getState())).toEqual(totals);
    t.store.dispatch(setKept({ username: 'bob', kept: true }));
    t.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.UNTAGGED }));
    t.store.dispatch(setDecisionFilter(DecisionFilter.KEPT));
    expect(selectScopeTotals(t.store.getState())).toEqual(totals);
  });

  test('the matching count reads any filters (the Filter sheet draft) and leaves the list alone', async () => {
    const t = await importedStore();
    t.store.dispatch(setKept({ username: 'alice', kept: true }));
    const state = t.store.getState();
    const draft = (choice: Partial<typeof state.filters>) =>
      selectMatchingCount(state, { ...state.filters, ...choice });
    expect(draft({})).toBe(3); // Following, as shown
    expect(draft({ scope: REVIEW_SCOPES.FOLLOWERS })).toBe(2);
    expect(draft({ scope: REVIEW_SCOPES.FOLLOWERS, decision: DecisionFilter.NEEDS_DECISION })).toBe(1); // dave
    expect(draft({ scope: REVIEW_SCOPES.ALL_CURRENT, query: 'a' })).toBe(3); // alice, carol, dave
    expect(selectListKeys(state)).toEqual(['alice', 'bob', 'carol']);
  });

  test('selector results are read-only at compile time', async () => {
    const t = await importedStore();
    const alice = account(t, 'alice');
    expect(() => {
      // @ts-expect-error state handed to components must not be writable
      alice.review.unavailable = true;
    }).toThrow(TypeError); // and Immer has frozen it at runtime too
  });
});
