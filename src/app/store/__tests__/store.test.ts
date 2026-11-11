import {
  createMemoryBackupStore,
  type BackupStore,
  selectAccount,
  selectIsDirty,
  selectFollowChangeCounts,
  selectPlanStats,
  selectTagCounts,
  selectTags,
  selectUnsavedDiff,
  selectUnsavedAccountCount,
  selectChangeSections,
  selectChangesTotal,
  selectRenamePairs,
  RenameMatch,
  RenameState,
  STATUS_EVENTS,
  importPrepared,
  restoreBackup,
  saveMaster,
} from '@/entities/master';
import { must } from '@/entities/master/lib/__tests__/helpers.ts';
import { isKept, planOf } from '@/entities/master/lib/decision.ts';
import { IMPORT_PROBLEMS } from '@/entities/master/lib/importProblems.ts';
import { parseMaster, toMasterFile } from '@/entities/master/lib/masterFile.ts';
import { SESSION_CHANGES } from '@/entities/master/lib/sessionDiff.ts';
import {
  ACTION_TYPES,
  FOLLOW_CHANGES,
  PLAN_STATES,
  REVIEW_SCOPES,
  DecisionFilter,
  DecisionKind,
  TAG_FILTER_KINDS,
} from '@/entities/master/lib/types.ts';
import {
  confirmRename,
  deleteTag,
  dismissRename,
  undoRename,
  renameTag,
  resetChanges,
  keepInstead,
  setNote,
  setPlan,
  setKept,
  setUnavailable,
  toggleTag,
} from '@/entities/master/model/masterSlice.ts';
import { RETRY_DELAYS_MS, persistenceStopped } from '@/entities/master/model/persistence.ts';
import { selectScopeTotals } from '@/entities/master/model/selectors.ts';
import { selectListKeys, LIST_VIEWS } from '@/features/filters';
import {
  applyFilters,
  clearFilters,
  setDecisionFilter,
  setQuery,
  setScope,
  setTagFilter,
  setView,
} from '@/features/filters/model/filtersSlice.ts';
import {
  selectVisibleAccountKeys,
  selectMatchingCount,
  selectTodoStartView,
} from '@/features/filters/model/selectors.ts';

import type { AppStore, RootState } from '../store.ts';

import {
  WRITES,
  deferred,
  flushPersistence,
  makeTestStore,
  prepared,
  recordingBackup,
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
  const testStore = makeTestStore(options);
  await testStore.store.dispatch(importPrepared(prepared())).unwrap();
  return testStore;
}

const account = (store: AppStore, key: string) => must(selectAccount(store.getState(), key), key);

describe('import', () => {
  test('first import starts a dirty master whose baseline is the imported state', async () => {
    const { store } = await importedStore();
    const state = store.getState();
    expect(state.master.base?.lastImportAt).toBe('2026-10-27T12:00:00.000Z');
    expect(Object.keys(state.master.changed)).toEqual([]); // the imported master is the session baseline
    expect(selectIsDirty(state)).toBe(true);
    expect(state.master.status).toBeNull(); // an import says nothing
  });

  test('re-importing the saved master with the same export is clean', async () => {
    const { store, downloads } = await importedStore();
    await store.dispatch(saveMaster()).unwrap();
    const saved = JSON.parse(must(downloads[0]).text) as unknown;

    const reimported = makeTestStore();
    await reimported.store.dispatch(importPrepared(prepared({ master: saved }))).unwrap();
    expect(selectIsDirty(reimported.store.getState())).toBe(false);
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
    const { store } = makeTestStore();
    store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'nonexistent' }));
    await store.dispatch(importPrepared(prepared())).unwrap();
    expect(store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.ALL });
  });
});

describe('edits', () => {
  test('kept: keeps and un-keeps; repeating the same value or unknown accounts are a no-op', async () => {
    const { store } = await importedStore();
    const r0 = store.getState().master.revision;
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    expect(account(store, 'bob').decision).toEqual({ kind: DecisionKind.KEPT });
    store.dispatch(setKept({ username: 'bob', isKept: false }));
    expect(account(store, 'bob').decision).toBeUndefined();
    expect(store.getState().master.revision).toBe(r0 + 2);

    store.dispatch(setKept({ username: 'nobody', isKept: true }));
    expect(store.getState().master.revision).toBe(r0 + 2);
  });

  test('unavailable: marking keeps an undecided account; clearing changes no decision', async () => {
    const { store } = await importedStore();
    store.dispatch(setUnavailable({ username: 'bob', unavailable: true }));
    expect(account(store, 'bob')).toMatchObject({
      decision: { kind: DecisionKind.KEPT },
      review: { unavailable: true },
    });
    store.dispatch(setUnavailable({ username: 'bob', unavailable: false }));
    expect(account(store, 'bob')).toMatchObject({
      decision: { kind: DecisionKind.KEPT },
      review: { unavailable: false },
    });

    // An account you already queued stays queued.
    store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    store.dispatch(setUnavailable({ username: 'alice', unavailable: true }));
    expect(planOf(account(store, 'alice'), UNFOLLOW)).toBe(PLAN_STATES.PLANNED);
  });

  test('plans: queuing decides; done and back; undoing the last plan undecides; ineligible is ignored', async () => {
    const { store } = await importedStore();
    const stats = () => selectPlanStats(store.getState());
    store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    expect(planOf(account(store, 'bob'), UNFOLLOW)).toBe(PLAN_STATES.PLANNED);
    expect(account(store, 'bob').decision?.kind).toBe(DecisionKind.QUEUED);
    expect(stats().planned[UNFOLLOW]).toBe(1);

    store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    expect(planOf(account(store, 'bob'), UNFOLLOW)).toBe(PLAN_STATES.DONE);
    expect(stats()).toMatchObject({ planned: { [UNFOLLOW]: 0 }, done: { [UNFOLLOW]: 1 } });

    store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    expect(planOf(account(store, 'bob'), UNFOLLOW)).toBe(PLAN_STATES.PLANNED);
    store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: null }));
    expect(planOf(account(store, 'bob'), UNFOLLOW)).toBeUndefined();
    expect(account(store, 'bob').decision).toBeUndefined();

    const revisionBefore = store.getState().master.revision;
    // bob doesn't follow you
    store.dispatch(setPlan({ username: 'bob', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: null })); // nothing to cancel
    expect(store.getState().master.revision).toBe(revisionBefore);
  });

  test('Keep clears plans; queuing a kept account turns it into queued', async () => {
    const { store } = await importedStore();
    store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    store.dispatch(setKept({ username: 'alice', isKept: true }));
    expect(account(store, 'alice').decision).toEqual({ kind: DecisionKind.KEPT });
    expect(selectPlanStats(store.getState()).planned).toEqual({ [UNFOLLOW]: 0, [REMOVE_FOLLOWER]: 0 });

    store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    expect(account(store, 'alice').decision).toEqual({
      kind: DecisionKind.QUEUED,
      plans: { [REMOVE_FOLLOWER]: PLAN_STATES.PLANNED },
    });
  });

  test('Keep instead (To do) drops one plan; with none left the account is Kept', async () => {
    const { store } = await importedStore();
    store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.DONE }));

    store.dispatch(keepInstead({ username: 'alice', type: UNFOLLOW }));
    expect(account(store, 'alice').decision).toEqual({
      kind: DecisionKind.QUEUED,
      plans: { [REMOVE_FOLLOWER]: PLAN_STATES.DONE },
    });
    store.dispatch(keepInstead({ username: 'alice', type: REMOVE_FOLLOWER }));
    expect(account(store, 'alice').decision).toEqual({ kind: DecisionKind.KEPT });

    const revisionBefore = store.getState().master.revision;
    store.dispatch(keepInstead({ username: 'alice', type: UNFOLLOW })); // nothing queued: no-op
    expect(store.getState().master.revision).toBe(revisionBefore);
  });

  test('tags toggle and notes only count real changes', async () => {
    const { store } = await importedStore();
    store.dispatch(toggleTag({ username: 'carol', tag: 'artist' }));
    expect(account(store, 'carol').review.tags).toEqual(['artist']);
    store.dispatch(toggleTag({ username: 'carol', tag: 'artist' }));
    expect(account(store, 'carol').review.tags).toEqual([]);

    store.dispatch(setNote({ username: 'carol', note: 'hi' }));
    const revisionBefore = store.getState().master.revision;
    store.dispatch(setNote({ username: 'carol', note: 'hi' }));
    expect(store.getState().master.revision).toBe(revisionBefore);
  });
});

describe('save', () => {
  test('downloads a master that re-imports unchanged; the session baseline is kept', async () => {
    const { store, setNow, downloads, lastSaved } = await importedStore();
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    setNow('2026-10-27T14:05:09.000Z');
    await store.dispatch(saveMaster()).unwrap();

    const file = must(downloads[0]);
    expect(file.filename).toMatch(/^unfollowism_progress_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
    const saved = JSON.parse(file.text) as { lastSavedAt: string };
    expect(saved.lastSavedAt).toBe('2026-10-27T14:05:09.000Z');
    expect(toMasterFile(parseMaster(saved))).toEqual(saved); // the file is exactly the saved format

    const state = store.getState();
    expect(selectIsDirty(state)).toBe(false);
    expect(selectUnsavedDiff(state)).toEqual([]); // saved: nothing left to list
    expect(lastSaved.get()).toBe('2026-10-27T14:05:09.000Z');
  });

  test('the unsaved changes list covers only what came after the last save', async () => {
    const { store } = await importedStore();
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    await store.dispatch(saveMaster()).unwrap();
    store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    store.dispatch(setNote({ username: 'carol', note: 'x' }));
    expect(
      selectUnsavedDiff(store.getState()).map(entry => [entry.username, entry.changes.map(change => change.type)]),
    ).toEqual([
      ['bob', [SESSION_CHANGES.TAG_ADDED]],
      ['carol', [SESSION_CHANGES.NOTE_EDITED]],
    ]);
  });

  test('an edit that was undone leaves nothing unsaved', async () => {
    const { store } = await importedStore();
    await store.dispatch(saveMaster()).unwrap();
    store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectIsDirty(store.getState())).toBe(true);
    store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectIsDirty(store.getState())).toBe(false);
  });

  test('an import that differs from its file stays unsaved without any edit', async () => {
    const { store } = makeTestStore();
    await store.dispatch(importPrepared(prepared())).unwrap(); // no master: a new one, not downloaded yet
    expect(selectIsDirty(store.getState())).toBe(true);
    store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectIsDirty(store.getState())).toBe(true);
  });

  test('edits made while saving stay unsaved', async () => {
    const gate = deferred();
    const { store } = makeTestStore({ download: () => gate.promise });
    await store.dispatch(importPrepared(prepared())).unwrap();

    const saving = store.dispatch(saveMaster());
    store.dispatch(setNote({ username: 'bob', note: 'typed during save' }));
    gate.resolve();
    await saving;

    expect(selectIsDirty(store.getState())).toBe(true);
    expect(store.getState().master.status).toEqual({ type: STATUS_EVENTS.SAVED });
  });

  test('a second save while one is running is ignored', async () => {
    const gate = deferred();
    const calls: string[] = [];
    const { store } = makeTestStore({
      download: name => {
        calls.push(name);
        return gate.promise;
      },
    });
    await store.dispatch(importPrepared(prepared())).unwrap();

    const first = store.dispatch(saveMaster());
    await store.dispatch(saveMaster());
    gate.resolve();
    await first;
    expect(calls).toHaveLength(1);
  });

  test('a failed download keeps its message, marks nothing saved, and saving works again', async () => {
    let shouldFail = true;
    const { store } = makeTestStore({
      download: () => {
        if (shouldFail) {
          throw new Error('Download blocked');
        }
      },
    });
    await store.dispatch(importPrepared(prepared())).unwrap();

    await store.dispatch(saveMaster());
    expect(store.getState().master.status).toEqual({
      type: STATUS_EVENTS.SAVE_FAILED,
      reason: 'Download blocked',
    });
    expect(selectIsDirty(store.getState())).toBe(true);

    shouldFail = false;
    await store.dispatch(saveMaster()).unwrap();
    expect(selectIsDirty(store.getState())).toBe(false);
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
  const review = (store: AppStore, key: string) => account(store, key).review;
  const kept = (store: AppStore, key: string) => isKept(account(store, key));

  test("goes back to the last save, with that save's status", async () => {
    const { store } = await importedStore();
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    await store.dispatch(saveMaster()).unwrap();
    const savedStatus = store.getState().master.status;

    store.dispatch(setNote({ username: 'bob', note: 'after save' }));
    store.dispatch(setKept({ username: 'carol', isKept: true }));
    expect(selectUnsavedAccountCount(store.getState())).toBe(2);

    store.dispatch(resetChanges());
    const state = store.getState();
    expect(kept(store, 'bob')).toBe(true);
    expect(review(store, 'bob').notes).toBe('');
    expect(kept(store, 'carol')).toBe(false);
    expect(selectIsDirty(state)).toBe(false);
    expect(selectUnsavedAccountCount(state)).toBe(0);
    expect(state.master.status).toEqual(savedStatus);
    expect(selectUnsavedDiff(state)).toEqual([]); // back to the save: nothing unsaved
  });

  test('without a save since the import, goes back to the import', async () => {
    const { store, downloads } = makeTestStore();
    await store.dispatch(importPrepared(prepared())).unwrap();
    await store.dispatch(saveMaster()).unwrap();
    const saved = JSON.parse(must(downloads[0]).text) as unknown;

    const reimported = makeTestStore();
    await reimported.store.dispatch(importPrepared(prepared({ master: saved }))).unwrap(); // clean import
    const importStatus = reimported.store.getState().master.status;
    reimported.store.dispatch(setKept({ username: 'bob', isKept: true }));
    reimported.store.dispatch(resetChanges());

    const state = reimported.store.getState();
    expect(kept(reimported.store, 'bob')).toBe(false);
    expect(Object.keys(state.master.changed)).toEqual([]);
    expect(selectIsDirty(state)).toBe(false);
    expect(state.master.status).toEqual(importStatus);
  });

  test('an import that was never saved stays unsaved after a reset', async () => {
    const { store } = await importedStore(); // a new master: not in any file yet
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    store.dispatch(resetChanges());
    expect(kept(store, 'bob')).toBe(false);
    expect(selectIsDirty(store.getState())).toBe(true);
  });

  test('Reset after a save undoes edits made while saving', async () => {
    const gate = deferred();
    const { store } = makeTestStore({ download: () => gate.promise });
    await store.dispatch(importPrepared(prepared())).unwrap();
    const saving = store.dispatch(saveMaster());
    store.dispatch(setNote({ username: 'bob', note: 'typed during save' }));
    gate.resolve();
    await saving;

    store.dispatch(resetChanges());
    expect(store.getState().master.status).toEqual({ type: STATUS_EVENTS.SAVED });
    expect(review(store, 'bob').notes).toBe('');
  });

  test('accounts changed back to their saved state are not counted', async () => {
    const { store } = await importedStore();
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    store.dispatch(setNote({ username: 'carol', note: 'x' }));
    store.dispatch(setNote({ username: 'carol', note: '' }));
    expect(selectUnsavedAccountCount(store.getState())).toBe(1);
  });

  test('a tag taken off and put back is not counted, though it is now last', async () => {
    const { store } = await importedStore();
    store.dispatch(toggleTag({ username: 'bob', tag: 'a' }));
    store.dispatch(toggleTag({ username: 'bob', tag: 'b' }));
    await store.dispatch(saveMaster()).unwrap();
    store.dispatch(toggleTag({ username: 'bob', tag: 'a' }));
    store.dispatch(toggleTag({ username: 'bob', tag: 'a' }));
    expect(account(store, 'bob').review.tags).toEqual(['b', 'a']);
    expect(selectUnsavedAccountCount(store.getState())).toBe(0);
    expect(selectUnsavedDiff(store.getState())).toEqual([]);
  });

  test('works after a reload', async () => {
    const { store, backup } = await importedStore();
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    await store.dispatch(saveMaster()).unwrap();
    store.dispatch(setNote({ username: 'bob', note: 'after save' }));
    store.dispatch(setNote({ username: 'carol', note: 'after save' }));
    await flushPersistence();

    const reloaded = makeTestStore({ backup });
    await reloaded.store.dispatch(restoreBackup());
    expect(selectUnsavedAccountCount(reloaded.store.getState())).toBe(2);
    reloaded.store.dispatch(resetChanges());
    expect(kept(reloaded.store, 'bob')).toBe(true);
    expect(review(reloaded.store, 'bob').notes).toBe('');
    expect(review(reloaded.store, 'carol').notes).toBe('');
    expect(selectIsDirty(reloaded.store.getState())).toBe(false);
    await flushPersistence();

    const again = makeTestStore({ backup }); // and the reset itself survives a reload
    await again.store.dispatch(restoreBackup());
    expect(review(again.store, 'carol').notes).toBe('');
    expect(selectIsDirty(again.store.getState())).toBe(false);
  });
});

describe('tags', () => {
  test('rename and delete touch only tagged accounts; the filter follows; Reset changes undoes them', async () => {
    const { store } = await importedStore();
    store.dispatch(toggleTag({ username: 'alice', tag: 'dog' }));
    store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    store.dispatch(toggleTag({ username: 'bob', tag: 'artist' }));
    await store.dispatch(saveMaster()).unwrap();
    expect(selectTags(store.getState())).toEqual(['artist', 'dog']);

    store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'dog' }));
    const revisionBefore = store.getState().master.revision;
    store.dispatch(renameTag({ from: 'dog', to: 'artist' })); // merge
    expect(account(store, 'alice').review.tags).toEqual(['artist']);
    expect(account(store, 'bob').review.tags).toEqual(['artist']);
    expect(selectTagCounts(store.getState()).artist).toBe(2);
    expect(selectTagCounts(store.getState()).dog ?? 0).toBe(0);
    expect(selectTags(store.getState())).toEqual(['artist']);
    expect(store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.TAG, tag: 'artist' });
    expect(store.getState().master.revision).toBe(revisionBefore + 1); // one change, however many accounts
    expect(store.getState().master.changed.carol).toBeUndefined(); // carol has no tags: not edited

    store.dispatch(deleteTag({ tag: 'artist' }));
    expect(selectTags(store.getState())).toEqual([]);
    expect(store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.ALL }); // its tag is gone

    store.dispatch(resetChanges());
    expect(selectTags(store.getState())).toEqual(['artist', 'dog']);
    expect(account(store, 'bob').review.tags).toEqual(['dog', 'artist']);
  });

  test('removing a tag from its last account makes it disappear, and the filter resets', async () => {
    const { store } = await importedStore();
    store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'dog' }));
    store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectTags(store.getState())).toEqual([]);
    expect(store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.ALL });
  });
});

describe('filters', () => {
  test('the Filter popup applies list, tag and decision at once; Clear all keeps the list', async () => {
    const { store } = await importedStore();
    store.dispatch(toggleTag({ username: 'alice', tag: 'artist' }));
    store.dispatch(setQuery('a'));
    store.dispatch(
      applyFilters({
        scope: REVIEW_SCOPES.MUTUAL,
        tag: { kind: TAG_FILTER_KINDS.TAG, tag: 'artist' },
        decision: DecisionFilter.NEEDS_DECISION,
      }),
    );
    expect(store.getState().filters).toMatchObject({
      scope: REVIEW_SCOPES.MUTUAL,
      tag: { kind: TAG_FILTER_KINDS.TAG, tag: 'artist' },
      decision: DecisionFilter.NEEDS_DECISION,
      query: 'a',
    });
    expect(selectListKeys(store.getState())).toEqual(['alice']);

    store.dispatch(clearFilters());
    expect(store.getState().filters).toMatchObject({
      scope: REVIEW_SCOPES.MUTUAL,
      tag: { kind: TAG_FILTER_KINDS.ALL },
      decision: DecisionFilter.ANY,
      query: 'a',
    });
  });
});

describe('list refresh', () => {
  test('the shown list changes on filter change, import, restore and resets, never on an edit', async () => {
    const { store, backup } = await importedStore();
    const shown = () => selectListKeys(store.getState());
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // import

    store.dispatch(setDecisionFilter(DecisionFilter.NEEDS_DECISION));
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // an edit doesn't move cards
    store.dispatch(setQuery(''));
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // same filters: same list
    store.dispatch(setQuery('a'));
    expect(shown()).toEqual(['alice', 'carol']);

    store.dispatch(setQuery(''));
    store.dispatch(resetChanges());
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // bob needs a decision again
    await flushPersistence();

    const reloaded = makeTestStore({ backup });
    await reloaded.store.dispatch(restoreBackup());
    expect(selectListKeys(reloaded.store.getState())).toEqual(['alice', 'bob', 'carol']);
  });
});

describe('reload safety net', () => {
  test('a reload puts back the work, including the session baseline', async () => {
    const { store, backup } = await importedStore();
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    store.dispatch(toggleTag({ username: 'bob', tag: 'artist' }));
    await flushPersistence();

    const reloaded = makeTestStore({ backup });
    await reloaded.store.dispatch(restoreBackup());
    const before = store.getState();
    const after = reloaded.store.getState();

    expect(selectIsDirty(after)).toBe(true);
    expect(after.master.revision).toBe(before.master.revision);
    expect(JSON.parse(JSON.stringify(after.master.base))).toEqual(JSON.parse(JSON.stringify(before.master.base)));
    expect(JSON.parse(JSON.stringify(after.master.changed))).toEqual(JSON.parse(JSON.stringify(before.master.changed)));
    expect(selectUnsavedDiff(after)).toEqual(selectUnsavedDiff(before));
  });

  test('what the import found besides the master (compare numbers, done plans) survives a reload', async () => {
    const { store, downloads, backup } = await importedStore();
    store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    await store.dispatch(saveMaster()).unwrap();
    const master: unknown = JSON.parse(must(downloads[0]).text);
    await store.dispatch(importPrepared(prepared({ following: [['Alice'], ['carol']], master }))).unwrap();
    expect(store.getState().master.importFacts).toEqual({
      followingBefore: 3,
      followersBefore: 2,
      completedPlans: { bob: [UNFOLLOW] },
    });
    await flushPersistence();

    const reloaded = makeTestStore({ backup });
    await reloaded.store.dispatch(restoreBackup());
    expect(reloaded.store.getState().master.importFacts).toEqual(store.getState().master.importFacts);
  });

  test('a __proto__ account and tag survive edits, a save and a reload', async () => {
    const { store, downloads, backup } = makeTestStore();
    await store.dispatch(importPrepared(prepared({ following: [['__proto__'], ['bob']] }))).unwrap();
    store.dispatch(toggleTag({ username: '__proto__', tag: '__proto__' }));
    expect(selectTags(store.getState())).toEqual(['__proto__']);
    expect(selectTagCounts(store.getState())['__proto__']).toBe(1);

    await store.dispatch(saveMaster()).unwrap();
    expect(Object.keys(parseMaster(JSON.parse(must(downloads[0]).text)).accounts)).toContain('__proto__');
    store.dispatch(setNote({ username: '__proto__', note: 'after save' }));
    await flushPersistence();

    const reloaded = makeTestStore({ backup });
    await reloaded.store.dispatch(restoreBackup());
    expect(account(reloaded.store, '__proto__').review).toMatchObject({ tags: ['__proto__'], notes: 'after save' });
    reloaded.store.dispatch(resetChanges());
    expect(account(reloaded.store, '__proto__').review).toMatchObject({ tags: ['__proto__'], notes: '' });
  });

  test('a new tab (nothing stored) starts empty', async () => {
    const { store } = makeTestStore();
    expect(await store.dispatch(restoreBackup()).unwrap()).toBeNull();
    expect(store.getState().master.base).toBeNull();
  });

  test('import stores the master once; each edit stores only the accounts it changed', async () => {
    const { backup, writes } = recordingBackup();
    const { store } = makeTestStore({ backup });
    await store.dispatch(importPrepared(prepared())).unwrap();
    await flushPersistence();
    expect(writes).toEqual([write(WRITES.REPLACE)]);

    store.dispatch(setNote({ username: 'bob', note: 'x' }));
    await flushPersistence();
    store.dispatch(setKept({ username: 'alice', isKept: true }));
    store.dispatch(setKept({ username: 'carol', isKept: true }));
    await flushPersistence();
    expect(writes.slice(1)).toEqual([
      write(WRITES.UPDATE, { accounts: ['bob'] }),
      write(WRITES.UPDATE, { accounts: ['alice'] }), // carol arrived during this write…
      write(WRITES.UPDATE, { accounts: ['carol'] }), // …and was folded into one follow-up
    ]);

    await store.dispatch(saveMaster()).unwrap();
    await flushPersistence();
    // the saved versions, for Reset after a reload
    expect(writes.at(-1)).toEqual(write(WRITES.UPDATE, { saved: ['bob', 'alice', 'carol'] }));

    store.dispatch(setNote({ username: 'dave', note: 'y' }));
    await flushPersistence();
    store.dispatch(resetChanges());
    await flushPersistence();
    expect(writes.slice(-2)).toEqual([
      write(WRITES.UPDATE, { accounts: ['dave'] }),
      write(WRITES.UPDATE, { removed: ['dave'] }),
    ]);
  });

  test('restoring after a reload writes nothing', async () => {
    const first = await importedStore();
    first.store.dispatch(setKept({ username: 'bob', isKept: true }));
    await flushPersistence();

    const { backup, writes } = recordingBackup(first.backup);
    const reloaded = makeTestStore({ backup });
    await reloaded.store.dispatch(restoreBackup());
    await flushPersistence();
    expect(writes).toEqual([]);

    reloaded.store.dispatch(setNote({ username: 'bob', note: 'after reload' }));
    await flushPersistence();
    expect(writes).toEqual([write(WRITES.UPDATE, { accounts: ['bob'] })]);
  });

  test('a new import replaces what was stored for the tab', async () => {
    const { store, backup } = await importedStore();
    store.dispatch(setNote({ username: 'bob', note: 'old session' }));
    await flushPersistence();
    await store.dispatch(importPrepared(prepared({ following: [['zed']], followers: [['zed']] }))).unwrap();
    await flushPersistence();

    const stored = must(await backup.load());
    expect(Object.keys(stored.changed)).toEqual([]);
    expect(Object.keys((stored.base as { accounts: object }).accounts)).toEqual(['zed']);
  });

  test('unusable stored data is reported, and the next import clears the report', async () => {
    const { backup, store } = makeTestStore();
    await backup.replace(
      { version: 1, lastImportAt: 'x', accounts: { bob: { username: '' } } },
      {
        revision: 1,
        savedRevision: 0,
        importFacts: { followingBefore: 0, followersBefore: 0, completedPlans: {} },
      },
      { changed: {}, saved: {} },
    );
    await store.dispatch(restoreBackup());
    expect(store.getState().master).toMatchObject({ base: null, hasRestoreFailed: true });

    await store.dispatch(importPrepared(prepared())).unwrap();
    expect(store.getState().master.hasRestoreFailed).toBe(false);
  });

  test("stored details without the edit counter are reported, so unsaved work can't look saved", async () => {
    const { store, backup } = await importedStore();
    store.dispatch(setNote({ username: 'bob', note: 'unsaved' }));
    await flushPersistence();
    const withoutRevision: BackupStore = {
      ...backup,
      load: async () => {
        const stored = must(await backup.load());
        return { ...stored, meta: { ...(stored.meta as object), revision: undefined } };
      },
    };

    const reloaded = makeTestStore({ backup: withoutRevision });
    await reloaded.store.dispatch(restoreBackup());
    expect(reloaded.store.getState().master).toMatchObject({ base: null, hasRestoreFailed: true });
  });

  test('a storage read that fails is reported; a new tab is not', async () => {
    const unreadable = makeTestStore({
      backup: { ...createMemoryBackupStore(), load: () => Promise.reject(new Error('no idb')) },
    });
    await unreadable.store.dispatch(restoreBackup());
    expect(unreadable.store.getState().master.hasRestoreFailed).toBe(true);

    const fresh = makeTestStore();
    await fresh.store.dispatch(restoreBackup());
    expect(fresh.store.getState().master.hasRestoreFailed).toBe(false);
  });

  test('storage failures are surfaced, not swallowed, and saving still works', async () => {
    const failing: BackupStore = {
      isDurable: true,
      load: () => Promise.reject(new Error('no idb')),
      replace: () => Promise.reject(new Error('quota')),
      update: () => Promise.reject(new Error('quota')),
    };
    const { store } = await importedStore({ backup: failing });
    await flushPersistence();
    expect(store.getState().master.hasPersistenceFailed).toBe(true);
    await store.dispatch(restoreBackup());
    expect(store.getState().master.hasRestoreFailed).toBe(false); // the work is already open: nothing to warn about
    await expect(store.dispatch(saveMaster()).unwrap()).resolves.toBeTruthy();
  });
});

describe('storage write failures', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /** A backup store whose writes fail while `failing.on` is set; counts every write attempt. */
  function flakyBackup(inner: BackupStore = createMemoryBackupStore()) {
    const failing = { on: false, attempts: 0 };
    const attempt = <T>(write: () => Promise<T>) => {
      failing.attempts += 1;
      return failing.on ? Promise.reject(new Error('quota')) : write();
    };
    const backup: BackupStore = {
      isDurable: true,
      load: () => inner.load(),
      replace: (...args) => attempt(() => inner.replace(...args)),
      update: (...args) => attempt(() => inner.update(...args)),
    };
    return { backup, failing };
  }

  /** Imports with real timers (the import waits for a paint), then switches to fake ones to step through retries. */
  async function importedWithFakeTimers(backup: BackupStore) {
    const testStore = makeTestStore({ backup });
    await testStore.store.dispatch(importPrepared(prepared())).unwrap();
    await flushPersistence();
    vi.useFakeTimers();
    return testStore;
  }

  const storedNote = async (backup: BackupStore, key: string) =>
    (must(await backup.load()).changed[key] as { review?: { notes: string } } | undefined)?.review?.notes;

  test('a failed write is retried by itself, and the warning clears once storage works again', async () => {
    const { backup, failing } = flakyBackup();
    const { store } = await importedWithFakeTimers(backup);

    failing.on = true;
    store.dispatch(setNote({ username: 'bob', note: 'my last edit' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().master.hasPersistenceFailed).toBe(true);

    failing.on = false; // no further edit: the retry alone has to store it
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(store.getState().master.hasPersistenceFailed).toBe(false);
    expect(await storedNote(backup, 'bob')).toBe('my last edit');
  });

  test('a backup whose stored data was deleted gets it rebuilt', async () => {
    let inner = createMemoryBackupStore();
    const { backup } = flakyBackup({
      isDurable: true,
      load: () => inner.load(),
      replace: (...args) => inner.replace(...args),
      update: (...args) => inner.update(...args),
    });
    const { store } = await importedWithFakeTimers(backup);

    inner = createMemoryBackupStore(); // the browser deleted the stored data
    store.dispatch(setNote({ username: 'bob', note: 'after the loss' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().master.hasPersistenceFailed).toBe(true); // an update needs the stored backup

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]); // the retry writes everything again
    expect(store.getState().master.hasPersistenceFailed).toBe(false);
    expect(must(await backup.load()).base).toMatchObject({ accounts: { bob: { username: 'bob' } } });
    expect(await storedNote(backup, 'bob')).toBe('after the loss');
  });

  test('after the last retry it waits for the next change', async () => {
    const { backup, failing } = flakyBackup();
    const { store } = await importedWithFakeTimers(backup);

    failing.on = true;
    failing.attempts = 0;
    store.dispatch(setNote({ username: 'bob', note: 'x' }));
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0) * 2);
    expect(failing.attempts).toBe(1 + RETRY_DELAYS_MS.length);

    failing.on = false;
    store.dispatch(setNote({ username: 'bob', note: 'y' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getState().master.hasPersistenceFailed).toBe(false);
    expect(await storedNote(backup, 'bob')).toBe('y');
  });

  test('once stopped, neither a pending retry nor a new edit writes', async () => {
    const { backup, failing } = flakyBackup();
    const { store } = await importedWithFakeTimers(backup);

    failing.on = true;
    store.dispatch(setNote({ username: 'bob', note: 'before' }));
    await vi.advanceTimersByTimeAsync(0);
    failing.attempts = 0;
    failing.on = false;

    store.dispatch(persistenceStopped());
    store.dispatch(setNote({ username: 'bob', note: 'after' }));
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0) * 2);
    expect(failing.attempts).toBe(0);
    expect(await storedNote(backup, 'bob')).toBeUndefined();
  });
});

describe('renames', () => {
  const lostFollowers = (state: RootState) => selectChangeSections(state)[FOLLOW_CHANGES.LOST_FOLLOWERS];
  const newFollowers = (state: RootState) => selectChangeSections(state)[FOLLOW_CHANGES.NEW_FOLLOWERS];
  const pairs = (state: RootState) => selectRenamePairs(state).map(({ from, to, state: at }) => ({ from, to, at }));
  /**
   * carol (follows me, tagged, noted, queued for removal) is saved, then shows up as carol_2 with the same
   * date.
   */
  async function renamedStore() {
    const testStore = makeTestStore();
    await testStore.store
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
    testStore.store.dispatch(toggleTag({ username: 'carol', tag: 'artist' }));
    testStore.store.dispatch(setNote({ username: 'carol', note: 'old note' }));
    testStore.store.dispatch(setPlan({ username: 'carol', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    await testStore.store.dispatch(saveMaster()).unwrap();
    const master: unknown = JSON.parse(must(testStore.downloads[0]).text);
    testStore.setNow('2026-10-28T12:00:00.000Z');
    await testStore.store
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
    return testStore;
  }

  test("the import suggests the rename and doesn't count its plan as done", async () => {
    const { store } = await renamedStore();
    const state = store.getState();
    expect(account(store, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });
    expect(state.master.importFacts?.completedPlans).toEqual({}); // carol's removal isn't done: she was renamed
    expect(selectRenamePairs(state)).toEqual([
      { from: 'carol', to: 'carol_2', match: RenameMatch.FOLLOWER, state: RenameState.WAITING },
    ]);
    // Neither name is listed elsewhere while the rename waits; the pair counts as one change.
    expect(lostFollowers(state)).toEqual([]);
    expect(newFollowers(state)).toEqual([]);
    expect(selectChangesTotal(state)).toBe(1);
    expect(selectScopeTotals(state)[REVIEW_SCOPES.ALL_ACCOUNTS]).toBe(4); // alice, bob, carol (past), carol_2
  });

  test('confirming moves the work to the new name, removes the old account, and saves without it', async () => {
    const { store, downloads } = await renamedStore();
    store.dispatch(confirmRename({ from: 'carol' }));
    const state = store.getState();

    expect(selectAccount(state, 'carol')).toBeUndefined();
    expect(account(store, 'carol_2')).toMatchObject({
      decision: { kind: DecisionKind.QUEUED, plans: { [REMOVE_FOLLOWER]: PLAN_STATES.PLANNED } },
      review: { tags: ['artist'], notes: 'old note' },
    });
    expect(pairs(state)).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.MOVED }]);
    expect(lostFollowers(state)).toEqual([]);
    expect(newFollowers(state)).toEqual([]); // the new name is no new follower
    expect(selectChangesTotal(state)).toBe(1);
    expect(selectScopeTotals(state)[REVIEW_SCOPES.ALL_ACCOUNTS]).toBe(3); // carol is gone, carol_2 stays
    expect(selectFollowChangeCounts(state)[FOLLOW_CHANGES.LOST_FOLLOWERS]).toBe(0);
    expect(selectTagCounts(state).artist).toBe(1);
    expect(selectPlanStats(state)[PLAN_STATES.PLANNED][REMOVE_FOLLOWER]).toBe(1);
    expect(selectUnsavedAccountCount(state)).toBe(2);
    expect(selectUnsavedDiff(state).find(entry => entry.username === 'carol')?.changes).toEqual([
      { type: SESSION_CHANGES.ACCOUNT_REMOVED },
    ]);

    await store.dispatch(saveMaster()).unwrap();
    const saved = parseMaster(JSON.parse(must(downloads[1]).text));
    expect(Object.keys(saved.accounts).sort()).toEqual(['alice', 'bob', 'carol_2']);
    expect(saved.accounts.carol_2?.review.tags).toEqual(['artist']);
  });

  test('Reset changes brings the old account back, with its suggestion', async () => {
    const { store } = await renamedStore();
    store.dispatch(confirmRename({ from: 'carol' }));
    store.dispatch(resetChanges());
    expect(account(store, 'carol')).toMatchObject({
      review: { tags: ['artist'] },
      renameSuggestion: { to: 'carol_2' },
    });
    expect(account(store, 'carol_2').review.tags).toEqual([]);
    expect(pairs(store.getState())).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.WAITING }]);
  });

  test('Not a rename is an ordinary edit: unsaved, listed, undone by Reset', async () => {
    const { store } = await renamedStore();
    store.dispatch(dismissRename({ from: 'carol' }));
    const state = store.getState();
    expect(account(store, 'carol').renameSuggestion).toBeUndefined();
    expect(account(store, 'carol').review.tags).toEqual(['artist']);
    expect(selectUnsavedAccountCount(state)).toBe(1);
    expect(selectUnsavedDiff(state)).toEqual([
      { username: 'carol', changes: [{ type: SESSION_CHANGES.RENAME_DISMISSED }] },
    ]);
    // Two different accounts: each back in its list, and the decided pair still shown.
    expect(pairs(state)).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.NOT_RENAME }]);
    expect(lostFollowers(state)).toEqual(['carol']);
    expect(newFollowers(state)).toEqual(['carol_2']);
    expect(selectChangesTotal(state)).toBe(3);

    store.dispatch(resetChanges());
    expect(account(store, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });
  });

  test('Undo takes back Move: both names as at the last save, the rename waits again, nothing unsaved', async () => {
    const { store } = await renamedStore();
    await store.dispatch(saveMaster()).unwrap(); // the new data saved, the rename still waiting
    store.dispatch(toggleTag({ username: 'carol_2', tag: 'friend' })); // an edit to the new name before Move
    store.dispatch(confirmRename({ from: 'carol' }));

    store.dispatch(undoRename({ from: 'carol' }));
    const state = store.getState();
    expect(pairs(state)).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.WAITING }]);
    expect(account(store, 'carol')).toMatchObject({
      review: { tags: ['artist'] },
      renameSuggestion: { to: 'carol_2' },
    });
    expect(account(store, 'carol_2').review.tags).toEqual([]); // edits since the save are undone too
    expect(selectIsDirty(state)).toBe(false);
  });

  test('Undo takes back Not a rename, and keeps other unsaved edits', async () => {
    const { store } = await renamedStore();
    store.dispatch(toggleTag({ username: 'alice', tag: 'friend' }));
    store.dispatch(dismissRename({ from: 'carol' }));
    store.dispatch(undoRename({ from: 'carol' }));
    const state = store.getState();
    expect(pairs(state)).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.WAITING }]);
    expect(account(store, 'alice').review.tags).toEqual(['friend']);
    expect(selectIsDirty(state)).toBe(true);
  });

  test('after a save, Undo goes back to the import: the rename waits again, to be saved', async () => {
    const { store } = await renamedStore();
    store.dispatch(dismissRename({ from: 'carol' }));
    await store.dispatch(saveMaster()).unwrap();
    store.dispatch(undoRename({ from: 'carol' }));
    const state = store.getState();
    expect(pairs(state)).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.WAITING }]);
    expect(account(store, 'carol')).toMatchObject({
      review: { tags: ['artist'] },
      renameSuggestion: { to: 'carol_2' },
    });
    expect(selectIsDirty(state)).toBe(true);

    store.dispatch(confirmRename({ from: 'carol' }));
    expect(account(store, 'carol_2').review.tags).toEqual(['artist']);
  });

  test('an open suggestion survives a reload, and so does a confirmed rename', async () => {
    const { backup } = await renamedStore();
    await flushPersistence();
    const reloaded = makeTestStore({ backup });
    await reloaded.store.dispatch(restoreBackup());
    expect(account(reloaded.store, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });

    reloaded.store.dispatch(confirmRename({ from: 'carol' }));
    await flushPersistence();
    const again = makeTestStore({ backup });
    await again.store.dispatch(restoreBackup());
    expect(selectAccount(again.store.getState(), 'carol')).toBeUndefined();
    expect(account(again.store, 'carol_2').review.notes).toBe('old note');
    again.store.dispatch(resetChanges()); // and the removal can still be undone
    expect(account(again.store, 'carol').review.notes).toBe('old note');
  });

  test('an open suggestion survives Save master and the next import, and still waits', async () => {
    const { store, downloads, setNow } = await renamedStore();
    await store.dispatch(saveMaster()).unwrap();
    const master: unknown = JSON.parse(must(downloads[1]).text);
    setNow('2026-10-29T12:00:00.000Z');
    await store
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
    expect(account(store, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });
    expect(pairs(store.getState())).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.WAITING }]);
  });
});

describe('selectors', () => {
  test('To do opens on the first tab with work left, else the first with done plans, else Unfollow', async () => {
    const { store } = await importedStore();
    const start = () => selectTodoStartView(store.getState());
    expect(start()).toBe(LIST_VIEWS.TO_UNFOLLOW); // nothing queued
    store.dispatch(setPlan({ username: 'dave', type: REMOVE_FOLLOWER, state: PLAN_STATES.DONE }));
    expect(start()).toBe(LIST_VIEWS.TO_REMOVE); // only done plans, all in Remove follower
    store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    expect(start()).toBe(LIST_VIEWS.TO_UNFOLLOW); // done plans in both: the first
    store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    expect(start()).toBe(LIST_VIEWS.TO_REMOVE); // work left wins over done
  });

  test('visible accounts follow scope, decision, tag and search, sorted by username', async () => {
    const { store } = await importedStore();
    const keys = () => selectVisibleAccountKeys(store.getState());
    expect(keys()).toEqual(['alice', 'bob', 'carol']); // I follow

    store.dispatch(setScope(REVIEW_SCOPES.FOLLOWERS));
    expect(keys()).toEqual(['alice', 'dave']);
    store.dispatch(setScope(REVIEW_SCOPES.ALL_CURRENT));
    store.dispatch(toggleTag({ username: 'dave', tag: 'artist' }));
    store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'artist' }));
    expect(keys()).toEqual(['dave']);
    store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.UNTAGGED }));
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    store.dispatch(setDecisionFilter(DecisionFilter.NEEDS_DECISION));
    expect(keys()).toEqual(['alice', 'carol']);
    store.dispatch(setQuery(' CAR '));
    expect(keys()).toEqual(['carol']);
  });

  test('Changes sections list what changed since the imported master was saved, regardless of scope', async () => {
    const { store, downloads, setNow } = await importedStore();
    await store.dispatch(saveMaster()).unwrap(); // saved at 12:00
    const saved = JSON.parse(must(downloads[0]).text) as unknown;
    const afterSave = Date.parse('2026-10-27T12:30:00.000Z') / 1000;
    setNow('2026-10-27T13:00:00.000Z');
    await store
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

    store.dispatch(setScope(REVIEW_SCOPES.FOLLOWERS)); // the Review list doesn't narrow Changes
    expect(selectChangeSections(store.getState())).toEqual({
      [FOLLOW_CHANGES.NEW_FOLLOWS]: ['erin'],
      [FOLLOW_CHANGES.UNFOLLOWED]: ['bob', 'carol'],
      [FOLLOW_CHANGES.NEW_FOLLOWERS]: ['erin'],
      [FOLLOW_CHANGES.LOST_FOLLOWERS]: ['dave'],
    });
    expect(selectFollowChangeCounts(store.getState())).toEqual({
      [FOLLOW_CHANGES.NEW_FOLLOWS]: 1,
      [FOLLOW_CHANGES.UNFOLLOWED]: 2,
      [FOLLOW_CHANGES.NEW_FOLLOWERS]: 1,
      [FOLLOW_CHANGES.LOST_FOLLOWERS]: 1,
    });
  });

  test('To do tabs list their plans, queued first, then done; Review filters do not apply', async () => {
    const { store } = await importedStore();
    store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    store.dispatch(setPlan({ username: 'carol', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    store.dispatch(setPlan({ username: 'dave', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    store.dispatch(setQuery('zzz')); // matches nobody
    store.dispatch(setView(LIST_VIEWS.TO_UNFOLLOW));
    expect(selectVisibleAccountKeys(store.getState())).toEqual(['bob', 'carol', 'alice']);
    store.dispatch(setView(LIST_VIEWS.TO_REMOVE));
    expect(selectVisibleAccountKeys(store.getState())).toEqual(['dave']);
  });

  test('editing one account keeps the list array and other accounts referentially stable', async () => {
    const { store } = await importedStore();
    const before = store.getState();
    store.dispatch(setNote({ username: 'bob', note: 'x' }));
    const after = store.getState();
    expect(selectVisibleAccountKeys(after)).toBe(selectVisibleAccountKeys(before));
    expect(selectAccount(after, 'alice')).toBe(selectAccount(before, 'alice'));
    expect(selectAccount(after, 'bob')).not.toBe(selectAccount(before, 'bob'));
  });

  test('per-list totals count each list whatever the other filters; edits never change them', async () => {
    const { store } = await importedStore(); // following Alice, bob, carol; followers alice, dave
    const totals = {
      [REVIEW_SCOPES.FOLLOWING]: 3,
      [REVIEW_SCOPES.FOLLOWERS]: 2,
      [REVIEW_SCOPES.MUTUAL]: 1,
      [REVIEW_SCOPES.NOT_FOLLOWING_BACK]: 2,
      [REVIEW_SCOPES.FOLLOWS_YOU_ONLY]: 1,
      [REVIEW_SCOPES.ALL_CURRENT]: 4,
      [REVIEW_SCOPES.ALL_ACCOUNTS]: 4,
    };
    expect(selectScopeTotals(store.getState())).toEqual(totals);
    store.dispatch(setKept({ username: 'bob', isKept: true }));
    store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.UNTAGGED }));
    store.dispatch(setDecisionFilter(DecisionFilter.KEPT));
    expect(selectScopeTotals(store.getState())).toEqual(totals);
  });

  test('the matching count reads any filters (the Filter popup draft) and leaves the list alone', async () => {
    const { store } = await importedStore();
    store.dispatch(setKept({ username: 'alice', isKept: true }));
    const state = store.getState();
    const draft = (choice: Partial<typeof state.filters>) =>
      selectMatchingCount(state, { ...state.filters, ...choice });
    expect(draft({})).toBe(3); // Following, as shown
    expect(draft({ scope: REVIEW_SCOPES.FOLLOWERS })).toBe(2);
    expect(draft({ scope: REVIEW_SCOPES.FOLLOWERS, decision: DecisionFilter.NEEDS_DECISION })).toBe(1); // dave
    expect(draft({ scope: REVIEW_SCOPES.ALL_CURRENT, query: 'a' })).toBe(3); // alice, carol, dave
    expect(selectListKeys(state)).toEqual(['alice', 'bob', 'carol']);
  });

  test('selector results are read-only at compile time', async () => {
    const { store } = await importedStore();
    const alice = account(store, 'alice');
    expect(() => {
      // @ts-expect-error state handed to components must not be writable
      alice.review.unavailable = true;
    }).toThrow(TypeError); // and Immer has frozen it at runtime too
  });
});
