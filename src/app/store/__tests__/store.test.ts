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

import type { RootState } from '../store.ts';

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
  const setup = makeTestStore(options);
  await setup.store.dispatch(importPrepared(prepared())).unwrap();
  return setup;
}

const account = (setup: Awaited<ReturnType<typeof importedStore>>, key: string) =>
  must(selectAccount(setup.store.getState(), key), key);

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
    const setup = await importedStore();
    await setup.store.dispatch(saveMaster()).unwrap();
    const saved = JSON.parse(must(setup.downloads[0]).text) as unknown;

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
    const setup = makeTestStore();
    setup.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'nonexistent' }));
    await setup.store.dispatch(importPrepared(prepared())).unwrap();
    expect(setup.store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.ALL });
  });
});

describe('edits', () => {
  test('kept: keeps and un-keeps; repeating the same value or unknown accounts are a no-op', async () => {
    const setup = await importedStore();
    const r0 = setup.store.getState().master.revision;
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    expect(account(setup, 'bob').decision).toEqual({ kind: DecisionKind.KEPT });
    setup.store.dispatch(setKept({ username: 'bob', kept: false }));
    expect(account(setup, 'bob').decision).toBeUndefined();
    expect(setup.store.getState().master.revision).toBe(r0 + 2);

    setup.store.dispatch(setKept({ username: 'nobody', kept: true }));
    expect(setup.store.getState().master.revision).toBe(r0 + 2);
  });

  test('unavailable: marking keeps an undecided account; clearing changes no decision', async () => {
    const setup = await importedStore();
    setup.store.dispatch(setUnavailable({ username: 'bob', unavailable: true }));
    expect(account(setup, 'bob')).toMatchObject({
      decision: { kind: DecisionKind.KEPT },
      review: { unavailable: true },
    });
    setup.store.dispatch(setUnavailable({ username: 'bob', unavailable: false }));
    expect(account(setup, 'bob')).toMatchObject({
      decision: { kind: DecisionKind.KEPT },
      review: { unavailable: false },
    });

    // An account you already queued stays queued.
    setup.store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    setup.store.dispatch(setUnavailable({ username: 'alice', unavailable: true }));
    expect(planOf(account(setup, 'alice'), UNFOLLOW)).toBe(PLAN_STATES.PLANNED);
  });

  test('plans: queuing decides; done and back; undoing the last plan undecides; ineligible is ignored', async () => {
    const setup = await importedStore();
    const stats = () => selectPlanStats(setup.store.getState());
    setup.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    expect(planOf(account(setup, 'bob'), UNFOLLOW)).toBe(PLAN_STATES.PLANNED);
    expect(account(setup, 'bob').decision?.kind).toBe(DecisionKind.QUEUED);
    expect(stats().planned[UNFOLLOW]).toBe(1);

    setup.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    expect(planOf(account(setup, 'bob'), UNFOLLOW)).toBe(PLAN_STATES.DONE);
    expect(stats()).toMatchObject({ planned: { [UNFOLLOW]: 0 }, done: { [UNFOLLOW]: 1 } });

    setup.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    expect(planOf(account(setup, 'bob'), UNFOLLOW)).toBe(PLAN_STATES.PLANNED);
    setup.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: null }));
    expect(planOf(account(setup, 'bob'), UNFOLLOW)).toBeUndefined();
    expect(account(setup, 'bob').decision).toBeUndefined();

    const revisionBefore = setup.store.getState().master.revision;
    // bob doesn't follow you
    setup.store.dispatch(setPlan({ username: 'bob', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    setup.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: null })); // nothing to cancel
    expect(setup.store.getState().master.revision).toBe(revisionBefore);
  });

  test('Keep clears plans; queuing a kept account turns it into queued', async () => {
    const setup = await importedStore();
    setup.store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    setup.store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    setup.store.dispatch(setKept({ username: 'alice', kept: true }));
    expect(account(setup, 'alice').decision).toEqual({ kind: DecisionKind.KEPT });
    expect(selectPlanStats(setup.store.getState()).planned).toEqual({ [UNFOLLOW]: 0, [REMOVE_FOLLOWER]: 0 });

    setup.store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    expect(account(setup, 'alice').decision).toEqual({
      kind: DecisionKind.QUEUED,
      plans: { [REMOVE_FOLLOWER]: PLAN_STATES.PLANNED },
    });
  });

  test('Keep instead (To do) drops one plan; with none left the account is Kept', async () => {
    const setup = await importedStore();
    setup.store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    setup.store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.DONE }));

    setup.store.dispatch(keepInstead({ username: 'alice', type: UNFOLLOW }));
    expect(account(setup, 'alice').decision).toEqual({
      kind: DecisionKind.QUEUED,
      plans: { [REMOVE_FOLLOWER]: PLAN_STATES.DONE },
    });
    setup.store.dispatch(keepInstead({ username: 'alice', type: REMOVE_FOLLOWER }));
    expect(account(setup, 'alice').decision).toEqual({ kind: DecisionKind.KEPT });

    const revisionBefore = setup.store.getState().master.revision;
    setup.store.dispatch(keepInstead({ username: 'alice', type: UNFOLLOW })); // nothing queued: no-op
    expect(setup.store.getState().master.revision).toBe(revisionBefore);
  });

  test('tags toggle and notes only count real changes', async () => {
    const setup = await importedStore();
    setup.store.dispatch(toggleTag({ username: 'carol', tag: 'artist' }));
    expect(account(setup, 'carol').review.tags).toEqual(['artist']);
    setup.store.dispatch(toggleTag({ username: 'carol', tag: 'artist' }));
    expect(account(setup, 'carol').review.tags).toEqual([]);

    setup.store.dispatch(setNote({ username: 'carol', note: 'hi' }));
    const revisionBefore = setup.store.getState().master.revision;
    setup.store.dispatch(setNote({ username: 'carol', note: 'hi' }));
    expect(setup.store.getState().master.revision).toBe(revisionBefore);
  });
});

describe('save', () => {
  test('downloads a master that re-imports unchanged; the session baseline is kept', async () => {
    const setup = await importedStore();
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    setup.setNow('2026-10-27T14:05:09.000Z');
    await setup.store.dispatch(saveMaster()).unwrap();

    const file = must(setup.downloads[0]);
    expect(file.filename).toMatch(/^unfollowism_progress_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
    const saved = JSON.parse(file.text) as { lastSavedAt: string };
    expect(saved.lastSavedAt).toBe('2026-10-27T14:05:09.000Z');
    expect(toMasterFile(parseMaster(saved))).toEqual(saved); // the file is exactly the saved format

    const state = setup.store.getState();
    expect(selectIsDirty(state)).toBe(false);
    expect(selectUnsavedDiff(state)).toEqual([]); // saved: nothing left to list
    expect(setup.lastSaved.get()).toBe('2026-10-27T14:05:09.000Z');
  });

  test('the unsaved changes list covers only what came after the last save', async () => {
    const setup = await importedStore();
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    await setup.store.dispatch(saveMaster()).unwrap();
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    setup.store.dispatch(setNote({ username: 'carol', note: 'x' }));
    expect(
      selectUnsavedDiff(setup.store.getState()).map(entry => [
        entry.username,
        entry.changes.map(change => change.type),
      ]),
    ).toEqual([
      ['bob', [SESSION_CHANGES.TAG_ADDED]],
      ['carol', [SESSION_CHANGES.NOTE_EDITED]],
    ]);
  });

  test('an edit that was undone leaves nothing unsaved', async () => {
    const setup = await importedStore();
    await setup.store.dispatch(saveMaster()).unwrap();
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectIsDirty(setup.store.getState())).toBe(true);
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectIsDirty(setup.store.getState())).toBe(false);
  });

  test('an import that differs from its file stays unsaved without any edit', async () => {
    const setup = makeTestStore();
    await setup.store.dispatch(importPrepared(prepared())).unwrap(); // no master: a new one, not downloaded yet
    expect(selectIsDirty(setup.store.getState())).toBe(true);
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectIsDirty(setup.store.getState())).toBe(true);
  });

  test('edits made while saving stay unsaved', async () => {
    const gate = deferred();
    const setup = makeTestStore({ download: () => gate.promise });
    await setup.store.dispatch(importPrepared(prepared())).unwrap();

    const saving = setup.store.dispatch(saveMaster());
    setup.store.dispatch(setNote({ username: 'bob', note: 'typed during save' }));
    gate.resolve();
    await saving;

    expect(selectIsDirty(setup.store.getState())).toBe(true);
    expect(setup.store.getState().master.status).toEqual({ type: STATUS_EVENTS.SAVED });
  });

  test('a second save while one is running is ignored', async () => {
    const gate = deferred();
    const calls: string[] = [];
    const setup = makeTestStore({
      download: name => {
        calls.push(name);
        return gate.promise;
      },
    });
    await setup.store.dispatch(importPrepared(prepared())).unwrap();

    const first = setup.store.dispatch(saveMaster());
    await setup.store.dispatch(saveMaster());
    gate.resolve();
    await first;
    expect(calls).toHaveLength(1);
  });

  test('a failed download keeps its message, marks nothing saved, and saving works again', async () => {
    let fail = true;
    const setup = makeTestStore({
      download: () => {
        if (fail) {
          throw new Error('Download blocked');
        }
      },
    });
    await setup.store.dispatch(importPrepared(prepared())).unwrap();

    await setup.store.dispatch(saveMaster());
    expect(setup.store.getState().master.status).toEqual({
      type: STATUS_EVENTS.SAVE_FAILED,
      reason: 'Download blocked',
    });
    expect(selectIsDirty(setup.store.getState())).toBe(true);

    fail = false;
    await setup.store.dispatch(saveMaster()).unwrap();
    expect(selectIsDirty(setup.store.getState())).toBe(false);
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
  const review = (setup: Awaited<ReturnType<typeof importedStore>>, key: string) => account(setup, key).review;
  const kept = (setup: Awaited<ReturnType<typeof importedStore>>, key: string) => isKept(account(setup, key));

  test("goes back to the last save, with that save's status", async () => {
    const setup = await importedStore();
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    await setup.store.dispatch(saveMaster()).unwrap();
    const savedStatus = setup.store.getState().master.status;

    setup.store.dispatch(setNote({ username: 'bob', note: 'after save' }));
    setup.store.dispatch(setKept({ username: 'carol', kept: true }));
    expect(selectUnsavedAccountCount(setup.store.getState())).toBe(2);

    setup.store.dispatch(resetChanges());
    const state = setup.store.getState();
    expect(kept(setup, 'bob')).toBe(true);
    expect(review(setup, 'bob').notes).toBe('');
    expect(kept(setup, 'carol')).toBe(false);
    expect(selectIsDirty(state)).toBe(false);
    expect(selectUnsavedAccountCount(state)).toBe(0);
    expect(state.master.status).toEqual(savedStatus);
    expect(selectUnsavedDiff(state)).toEqual([]); // back to the save: nothing unsaved
  });

  test('without a save since the import, goes back to the import', async () => {
    const setup = makeTestStore();
    await setup.store.dispatch(importPrepared(prepared())).unwrap();
    await setup.store.dispatch(saveMaster()).unwrap();
    const saved = JSON.parse(must(setup.downloads[0]).text) as unknown;

    const t2 = makeTestStore();
    await t2.store.dispatch(importPrepared(prepared({ master: saved }))).unwrap(); // clean import
    const importStatus = t2.store.getState().master.status;
    t2.store.dispatch(setKept({ username: 'bob', kept: true }));
    t2.store.dispatch(resetChanges());

    const state = t2.store.getState();
    expect(kept(t2, 'bob')).toBe(false);
    expect(Object.keys(state.master.changed)).toEqual([]);
    expect(selectIsDirty(state)).toBe(false);
    expect(state.master.status).toEqual(importStatus);
  });

  test('an import that was never saved stays unsaved after a reset', async () => {
    const setup = await importedStore(); // a new master: not in any file yet
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    setup.store.dispatch(resetChanges());
    expect(kept(setup, 'bob')).toBe(false);
    expect(selectIsDirty(setup.store.getState())).toBe(true);
  });

  test('Reset after a save undoes edits made while saving', async () => {
    const gate = deferred();
    const setup = makeTestStore({ download: () => gate.promise });
    await setup.store.dispatch(importPrepared(prepared())).unwrap();
    const saving = setup.store.dispatch(saveMaster());
    setup.store.dispatch(setNote({ username: 'bob', note: 'typed during save' }));
    gate.resolve();
    await saving;

    setup.store.dispatch(resetChanges());
    expect(setup.store.getState().master.status).toEqual({ type: STATUS_EVENTS.SAVED });
    expect(review(setup, 'bob').notes).toBe('');
  });

  test('accounts changed back to their saved state are not counted', async () => {
    const setup = await importedStore();
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    setup.store.dispatch(setNote({ username: 'carol', note: 'x' }));
    setup.store.dispatch(setNote({ username: 'carol', note: '' }));
    expect(selectUnsavedAccountCount(setup.store.getState())).toBe(1);
  });

  test('a tag taken off and put back is not counted, though it is now last', async () => {
    const setup = await importedStore();
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'a' }));
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'b' }));
    await setup.store.dispatch(saveMaster()).unwrap();
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'a' }));
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'a' }));
    expect(account(setup, 'bob').review.tags).toEqual(['b', 'a']);
    expect(selectUnsavedAccountCount(setup.store.getState())).toBe(0);
    expect(selectUnsavedDiff(setup.store.getState())).toEqual([]);
  });

  test('works after a reload', async () => {
    const setup = await importedStore();
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    await setup.store.dispatch(saveMaster()).unwrap();
    setup.store.dispatch(setNote({ username: 'bob', note: 'after save' }));
    setup.store.dispatch(setNote({ username: 'carol', note: 'after save' }));
    await flushPersistence();

    const reloaded = makeTestStore({ backup: setup.backup });
    await reloaded.store.dispatch(restoreBackup());
    expect(selectUnsavedAccountCount(reloaded.store.getState())).toBe(2);
    reloaded.store.dispatch(resetChanges());
    expect(kept(reloaded, 'bob')).toBe(true);
    expect(review(reloaded, 'bob').notes).toBe('');
    expect(review(reloaded, 'carol').notes).toBe('');
    expect(selectIsDirty(reloaded.store.getState())).toBe(false);
    await flushPersistence();

    const again = makeTestStore({ backup: setup.backup }); // and the reset itself survives a reload
    await again.store.dispatch(restoreBackup());
    expect(review(again, 'carol').notes).toBe('');
    expect(selectIsDirty(again.store.getState())).toBe(false);
  });
});

describe('tags', () => {
  test('rename and delete touch only tagged accounts; the filter follows; Reset changes undoes them', async () => {
    const setup = await importedStore();
    setup.store.dispatch(toggleTag({ username: 'alice', tag: 'dog' }));
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'artist' }));
    await setup.store.dispatch(saveMaster()).unwrap();
    expect(selectTags(setup.store.getState())).toEqual(['artist', 'dog']);

    setup.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'dog' }));
    const revisionBefore = setup.store.getState().master.revision;
    setup.store.dispatch(renameTag({ from: 'dog', to: 'artist' })); // merge
    expect(account(setup, 'alice').review.tags).toEqual(['artist']);
    expect(account(setup, 'bob').review.tags).toEqual(['artist']);
    expect(selectTagCounts(setup.store.getState()).artist).toBe(2);
    expect(selectTagCounts(setup.store.getState()).dog ?? 0).toBe(0);
    expect(selectTags(setup.store.getState())).toEqual(['artist']);
    expect(setup.store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.TAG, tag: 'artist' });
    expect(setup.store.getState().master.revision).toBe(revisionBefore + 1); // one change, however many accounts
    expect(setup.store.getState().master.changed.carol).toBeUndefined(); // carol has no tags: not edited

    setup.store.dispatch(deleteTag({ tag: 'artist' }));
    expect(selectTags(setup.store.getState())).toEqual([]);
    expect(setup.store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.ALL }); // its tag is gone

    setup.store.dispatch(resetChanges());
    expect(selectTags(setup.store.getState())).toEqual(['artist', 'dog']);
    expect(account(setup, 'bob').review.tags).toEqual(['dog', 'artist']);
  });

  test('removing a tag from its last account makes it disappear, and the filter resets', async () => {
    const setup = await importedStore();
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    setup.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'dog' }));
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'dog' }));
    expect(selectTags(setup.store.getState())).toEqual([]);
    expect(setup.store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.ALL });
  });
});

describe('filters', () => {
  test('the Filter popup applies list, tag and decision at once; Clear all keeps the list', async () => {
    const setup = await importedStore();
    setup.store.dispatch(toggleTag({ username: 'alice', tag: 'artist' }));
    setup.store.dispatch(setQuery('a'));
    setup.store.dispatch(
      applyFilters({
        scope: REVIEW_SCOPES.MUTUAL,
        tag: { kind: TAG_FILTER_KINDS.TAG, tag: 'artist' },
        decision: DecisionFilter.NEEDS_DECISION,
      }),
    );
    expect(setup.store.getState().filters).toMatchObject({
      scope: REVIEW_SCOPES.MUTUAL,
      tag: { kind: TAG_FILTER_KINDS.TAG, tag: 'artist' },
      decision: DecisionFilter.NEEDS_DECISION,
      query: 'a',
    });
    expect(selectListKeys(setup.store.getState())).toEqual(['alice']);

    setup.store.dispatch(clearFilters());
    expect(setup.store.getState().filters).toMatchObject({
      scope: REVIEW_SCOPES.MUTUAL,
      tag: { kind: TAG_FILTER_KINDS.ALL },
      decision: DecisionFilter.ANY,
      query: 'a',
    });
  });
});

describe('list refresh', () => {
  test('the shown list changes on filter change, import, restore and resets, never on an edit', async () => {
    const setup = await importedStore();
    const shown = () => selectListKeys(setup.store.getState());
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // import

    setup.store.dispatch(setDecisionFilter(DecisionFilter.NEEDS_DECISION));
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // an edit doesn't move cards
    setup.store.dispatch(setQuery(''));
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // same filters: same list
    setup.store.dispatch(setQuery('a'));
    expect(shown()).toEqual(['alice', 'carol']);

    setup.store.dispatch(setQuery(''));
    setup.store.dispatch(resetChanges());
    expect(shown()).toEqual(['alice', 'bob', 'carol']); // bob needs a decision again
    await flushPersistence();

    const reloaded = makeTestStore({ backup: setup.backup });
    await reloaded.store.dispatch(restoreBackup());
    expect(selectListKeys(reloaded.store.getState())).toEqual(['alice', 'bob', 'carol']);
  });
});

describe('reload safety net', () => {
  test('a reload puts back the work, including the session baseline', async () => {
    const setup = await importedStore();
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    setup.store.dispatch(toggleTag({ username: 'bob', tag: 'artist' }));
    await flushPersistence();

    const reloaded = makeTestStore({ backup: setup.backup });
    await reloaded.store.dispatch(restoreBackup());
    const before = setup.store.getState();
    const after = reloaded.store.getState();

    expect(selectIsDirty(after)).toBe(true);
    expect(after.master.revision).toBe(before.master.revision);
    expect(JSON.parse(JSON.stringify(after.master.base))).toEqual(JSON.parse(JSON.stringify(before.master.base)));
    expect(JSON.parse(JSON.stringify(after.master.changed))).toEqual(JSON.parse(JSON.stringify(before.master.changed)));
    expect(selectUnsavedDiff(after)).toEqual(selectUnsavedDiff(before));
  });

  test('what the import found besides the master (compare numbers, done plans) survives a reload', async () => {
    const setup = await importedStore();
    setup.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    await setup.store.dispatch(saveMaster()).unwrap();
    const master: unknown = JSON.parse(must(setup.downloads[0]).text);
    await setup.store.dispatch(importPrepared(prepared({ following: [['Alice'], ['carol']], master }))).unwrap();
    expect(setup.store.getState().master.importFacts).toEqual({
      followingBefore: 3,
      followersBefore: 2,
      completedPlans: { bob: [UNFOLLOW] },
    });
    await flushPersistence();

    const reloaded = makeTestStore({ backup: setup.backup });
    await reloaded.store.dispatch(restoreBackup());
    expect(reloaded.store.getState().master.importFacts).toEqual(setup.store.getState().master.importFacts);
  });

  test('a __proto__ account and tag survive edits, a save and a reload', async () => {
    const setup = makeTestStore();
    await setup.store.dispatch(importPrepared(prepared({ following: [['__proto__'], ['bob']] }))).unwrap();
    setup.store.dispatch(toggleTag({ username: '__proto__', tag: '__proto__' }));
    expect(selectTags(setup.store.getState())).toEqual(['__proto__']);
    expect(selectTagCounts(setup.store.getState())['__proto__']).toBe(1);

    await setup.store.dispatch(saveMaster()).unwrap();
    expect(Object.keys(parseMaster(JSON.parse(must(setup.downloads[0]).text)).accounts)).toContain('__proto__');
    setup.store.dispatch(setNote({ username: '__proto__', note: 'after save' }));
    await flushPersistence();

    const reloaded = makeTestStore({ backup: setup.backup });
    await reloaded.store.dispatch(restoreBackup());
    expect(account(reloaded, '__proto__').review).toMatchObject({ tags: ['__proto__'], notes: 'after save' });
    reloaded.store.dispatch(resetChanges());
    expect(account(reloaded, '__proto__').review).toMatchObject({ tags: ['__proto__'], notes: '' });
  });

  test('a new tab (nothing stored) starts empty', async () => {
    const { store } = makeTestStore();
    expect(await store.dispatch(restoreBackup()).unwrap()).toBeNull();
    expect(store.getState().master.base).toBeNull();
  });

  test('import stores the master once; each edit stores only the accounts it changed', async () => {
    const { backup, writes } = recordingBackup();
    const setup = makeTestStore({ backup });
    await setup.store.dispatch(importPrepared(prepared())).unwrap();
    await flushPersistence();
    expect(writes).toEqual([write(WRITES.REPLACE)]);

    setup.store.dispatch(setNote({ username: 'bob', note: 'x' }));
    await flushPersistence();
    setup.store.dispatch(setKept({ username: 'alice', kept: true }));
    setup.store.dispatch(setKept({ username: 'carol', kept: true }));
    await flushPersistence();
    expect(writes.slice(1)).toEqual([
      write(WRITES.UPDATE, { accounts: ['bob'] }),
      write(WRITES.UPDATE, { accounts: ['alice'] }), // carol arrived during this write…
      write(WRITES.UPDATE, { accounts: ['carol'] }), // …and was folded into one follow-up
    ]);

    await setup.store.dispatch(saveMaster()).unwrap();
    await flushPersistence();
    // the saved versions, for Reset after a reload
    expect(writes.at(-1)).toEqual(write(WRITES.UPDATE, { saved: ['bob', 'alice', 'carol'] }));

    setup.store.dispatch(setNote({ username: 'dave', note: 'y' }));
    await flushPersistence();
    setup.store.dispatch(resetChanges());
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
    const setup = await importedStore();
    setup.store.dispatch(setNote({ username: 'bob', note: 'old session' }));
    await flushPersistence();
    await setup.store.dispatch(importPrepared(prepared({ following: [['zed']], followers: [['zed']] }))).unwrap();
    await flushPersistence();

    const stored = must(await setup.backup.load());
    expect(Object.keys(stored.changed)).toEqual([]);
    expect(Object.keys((stored.base as { accounts: object }).accounts)).toEqual(['zed']);
  });

  test('unusable stored data is reported, and the next import clears the report', async () => {
    const setup = makeTestStore();
    await setup.backup.replace(
      { version: 1, lastImportAt: 'x', accounts: { bob: { username: '' } } },
      {
        revision: 1,
        savedRevision: 0,
        importFacts: { followingBefore: 0, followersBefore: 0, completedPlans: {} },
      },
      { changed: {}, saved: {} },
    );
    await setup.store.dispatch(restoreBackup());
    expect(setup.store.getState().master).toMatchObject({ base: null, restoreFailed: true });

    await setup.store.dispatch(importPrepared(prepared())).unwrap();
    expect(setup.store.getState().master.restoreFailed).toBe(false);
  });

  test("stored details without the edit counter are reported, so unsaved work can't look saved", async () => {
    const setup = await importedStore();
    setup.store.dispatch(setNote({ username: 'bob', note: 'unsaved' }));
    await flushPersistence();
    const withoutRevision: BackupStore = {
      ...setup.backup,
      load: async () => {
        const stored = must(await setup.backup.load());
        return { ...stored, meta: { ...(stored.meta as object), revision: undefined } };
      },
    };

    const reloaded = makeTestStore({ backup: withoutRevision });
    await reloaded.store.dispatch(restoreBackup());
    expect(reloaded.store.getState().master).toMatchObject({ base: null, restoreFailed: true });
  });

  test('a storage read that fails is reported; a new tab is not', async () => {
    const unreadable = makeTestStore({
      backup: { ...createMemoryBackupStore(), load: () => Promise.reject(new Error('no idb')) },
    });
    await unreadable.store.dispatch(restoreBackup());
    expect(unreadable.store.getState().master.restoreFailed).toBe(true);

    const fresh = makeTestStore();
    await fresh.store.dispatch(restoreBackup());
    expect(fresh.store.getState().master.restoreFailed).toBe(false);
  });

  test('storage failures are surfaced, not swallowed, and saving still works', async () => {
    const failing: BackupStore = {
      durable: true,
      load: () => Promise.reject(new Error('no idb')),
      replace: () => Promise.reject(new Error('quota')),
      update: () => Promise.reject(new Error('quota')),
    };
    const setup = await importedStore({ backup: failing });
    await flushPersistence();
    expect(setup.store.getState().master.persistenceFailed).toBe(true);
    await setup.store.dispatch(restoreBackup());
    expect(setup.store.getState().master.restoreFailed).toBe(false); // the work is already open: nothing to warn about
    await expect(setup.store.dispatch(saveMaster()).unwrap()).resolves.toBeTruthy();
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
      durable: true,
      load: () => inner.load(),
      replace: (...args) => attempt(() => inner.replace(...args)),
      update: (...args) => attempt(() => inner.update(...args)),
    };
    return { backup, failing };
  }

  /** Imports with real timers (the import waits for a paint), then switches to fake ones to step through retries. */
  async function importedWithFakeTimers(backup: BackupStore) {
    const setup = makeTestStore({ backup });
    await setup.store.dispatch(importPrepared(prepared())).unwrap();
    await flushPersistence();
    vi.useFakeTimers();
    return setup;
  }

  const storedNote = async (backup: BackupStore, key: string) =>
    (must(await backup.load()).changed[key] as { review?: { notes: string } } | undefined)?.review?.notes;

  test('a failed write is retried by itself, and the warning clears once storage works again', async () => {
    const { backup, failing } = flakyBackup();
    const setup = await importedWithFakeTimers(backup);

    failing.on = true;
    setup.store.dispatch(setNote({ username: 'bob', note: 'my last edit' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(setup.store.getState().master.persistenceFailed).toBe(true);

    failing.on = false; // no further edit: the retry alone has to store it
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]);
    expect(setup.store.getState().master.persistenceFailed).toBe(false);
    expect(await storedNote(backup, 'bob')).toBe('my last edit');
  });

  test('a backup whose stored data was deleted gets it rebuilt', async () => {
    let inner = createMemoryBackupStore();
    const { backup } = flakyBackup({
      durable: true,
      load: () => inner.load(),
      replace: (...args) => inner.replace(...args),
      update: (...args) => inner.update(...args),
    });
    const setup = await importedWithFakeTimers(backup);

    inner = createMemoryBackupStore(); // the browser deleted the stored data
    setup.store.dispatch(setNote({ username: 'bob', note: 'after the loss' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(setup.store.getState().master.persistenceFailed).toBe(true); // an update needs the stored backup

    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS[0]); // the retry writes everything again
    expect(setup.store.getState().master.persistenceFailed).toBe(false);
    expect(must(await backup.load()).base).toMatchObject({ accounts: { bob: { username: 'bob' } } });
    expect(await storedNote(backup, 'bob')).toBe('after the loss');
  });

  test('after the last retry it waits for the next change', async () => {
    const { backup, failing } = flakyBackup();
    const setup = await importedWithFakeTimers(backup);

    failing.on = true;
    failing.attempts = 0;
    setup.store.dispatch(setNote({ username: 'bob', note: 'x' }));
    await vi.advanceTimersByTimeAsync(RETRY_DELAYS_MS.reduce((sum, ms) => sum + ms, 0) * 2);
    expect(failing.attempts).toBe(1 + RETRY_DELAYS_MS.length);

    failing.on = false;
    setup.store.dispatch(setNote({ username: 'bob', note: 'y' }));
    await vi.advanceTimersByTimeAsync(0);
    expect(setup.store.getState().master.persistenceFailed).toBe(false);
    expect(await storedNote(backup, 'bob')).toBe('y');
  });

  test('once stopped, neither a pending retry nor a new edit writes', async () => {
    const { backup, failing } = flakyBackup();
    const setup = await importedWithFakeTimers(backup);

    failing.on = true;
    setup.store.dispatch(setNote({ username: 'bob', note: 'before' }));
    await vi.advanceTimersByTimeAsync(0);
    failing.attempts = 0;
    failing.on = false;

    setup.store.dispatch(persistenceStopped());
    setup.store.dispatch(setNote({ username: 'bob', note: 'after' }));
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
    const setup = makeTestStore();
    await setup.store
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
    setup.store.dispatch(toggleTag({ username: 'carol', tag: 'artist' }));
    setup.store.dispatch(setNote({ username: 'carol', note: 'old note' }));
    setup.store.dispatch(setPlan({ username: 'carol', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    await setup.store.dispatch(saveMaster()).unwrap();
    const master: unknown = JSON.parse(must(setup.downloads[0]).text);
    setup.setNow('2026-10-28T12:00:00.000Z');
    await setup.store
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
    return setup;
  }

  test("the import suggests the rename and doesn't count its plan as done", async () => {
    const setup = await renamedStore();
    const state = setup.store.getState();
    expect(account(setup, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });
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
    const setup = await renamedStore();
    setup.store.dispatch(confirmRename({ from: 'carol' }));
    const state = setup.store.getState();

    expect(selectAccount(state, 'carol')).toBeUndefined();
    expect(account(setup, 'carol_2')).toMatchObject({
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

    await setup.store.dispatch(saveMaster()).unwrap();
    const saved = parseMaster(JSON.parse(must(setup.downloads[1]).text));
    expect(Object.keys(saved.accounts).sort()).toEqual(['alice', 'bob', 'carol_2']);
    expect(saved.accounts.carol_2?.review.tags).toEqual(['artist']);
  });

  test('Reset changes brings the old account back, with its suggestion', async () => {
    const setup = await renamedStore();
    setup.store.dispatch(confirmRename({ from: 'carol' }));
    setup.store.dispatch(resetChanges());
    expect(account(setup, 'carol')).toMatchObject({
      review: { tags: ['artist'] },
      renameSuggestion: { to: 'carol_2' },
    });
    expect(account(setup, 'carol_2').review.tags).toEqual([]);
    expect(pairs(setup.store.getState())).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.WAITING }]);
  });

  test('Not a rename is an ordinary edit: unsaved, listed, undone by Reset', async () => {
    const setup = await renamedStore();
    setup.store.dispatch(dismissRename({ from: 'carol' }));
    const state = setup.store.getState();
    expect(account(setup, 'carol').renameSuggestion).toBeUndefined();
    expect(account(setup, 'carol').review.tags).toEqual(['artist']);
    expect(selectUnsavedAccountCount(state)).toBe(1);
    expect(selectUnsavedDiff(state)).toEqual([
      { username: 'carol', changes: [{ type: SESSION_CHANGES.RENAME_DISMISSED }] },
    ]);
    // Two different accounts: each back in its list, and the decided pair still shown.
    expect(pairs(state)).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.NOT_RENAME }]);
    expect(lostFollowers(state)).toEqual(['carol']);
    expect(newFollowers(state)).toEqual(['carol_2']);
    expect(selectChangesTotal(state)).toBe(3);

    setup.store.dispatch(resetChanges());
    expect(account(setup, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });
  });

  test('Undo takes back Move: both names as at the last save, the rename waits again, nothing unsaved', async () => {
    const setup = await renamedStore();
    await setup.store.dispatch(saveMaster()).unwrap(); // the new data saved, the rename still waiting
    setup.store.dispatch(toggleTag({ username: 'carol_2', tag: 'friend' })); // an edit to the new name before Move
    setup.store.dispatch(confirmRename({ from: 'carol' }));

    setup.store.dispatch(undoRename({ from: 'carol' }));
    const state = setup.store.getState();
    expect(pairs(state)).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.WAITING }]);
    expect(account(setup, 'carol')).toMatchObject({
      review: { tags: ['artist'] },
      renameSuggestion: { to: 'carol_2' },
    });
    expect(account(setup, 'carol_2').review.tags).toEqual([]); // edits since the save are undone too
    expect(selectIsDirty(state)).toBe(false);
  });

  test('Undo takes back Not a rename, and keeps other unsaved edits', async () => {
    const setup = await renamedStore();
    setup.store.dispatch(toggleTag({ username: 'alice', tag: 'friend' }));
    setup.store.dispatch(dismissRename({ from: 'carol' }));
    setup.store.dispatch(undoRename({ from: 'carol' }));
    const state = setup.store.getState();
    expect(pairs(state)).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.WAITING }]);
    expect(account(setup, 'alice').review.tags).toEqual(['friend']);
    expect(selectIsDirty(state)).toBe(true);
  });

  test('after a save, Undo goes back to the import: the rename waits again, to be saved', async () => {
    const setup = await renamedStore();
    setup.store.dispatch(dismissRename({ from: 'carol' }));
    await setup.store.dispatch(saveMaster()).unwrap();
    setup.store.dispatch(undoRename({ from: 'carol' }));
    const state = setup.store.getState();
    expect(pairs(state)).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.WAITING }]);
    expect(account(setup, 'carol')).toMatchObject({
      review: { tags: ['artist'] },
      renameSuggestion: { to: 'carol_2' },
    });
    expect(selectIsDirty(state)).toBe(true);

    setup.store.dispatch(confirmRename({ from: 'carol' }));
    expect(account(setup, 'carol_2').review.tags).toEqual(['artist']);
  });

  test('an open suggestion survives a reload, and so does a confirmed rename', async () => {
    const setup = await renamedStore();
    await flushPersistence();
    const reloaded = makeTestStore({ backup: setup.backup });
    await reloaded.store.dispatch(restoreBackup());
    expect(account(reloaded, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });

    reloaded.store.dispatch(confirmRename({ from: 'carol' }));
    await flushPersistence();
    const again = makeTestStore({ backup: setup.backup });
    await again.store.dispatch(restoreBackup());
    expect(selectAccount(again.store.getState(), 'carol')).toBeUndefined();
    expect(account(again, 'carol_2').review.notes).toBe('old note');
    again.store.dispatch(resetChanges()); // and the removal can still be undone
    expect(account(again, 'carol').review.notes).toBe('old note');
  });

  test('an open suggestion survives Save master and the next import, and still waits', async () => {
    const setup = await renamedStore();
    await setup.store.dispatch(saveMaster()).unwrap();
    const master: unknown = JSON.parse(must(setup.downloads[1]).text);
    setup.setNow('2026-10-29T12:00:00.000Z');
    await setup.store
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
    expect(account(setup, 'carol').renameSuggestion).toEqual({ to: 'carol_2', plans: [REMOVE_FOLLOWER] });
    expect(pairs(setup.store.getState())).toEqual([{ from: 'carol', to: 'carol_2', at: RenameState.WAITING }]);
  });
});

describe('selectors', () => {
  test('To do opens on the first tab with work left, else the first with done plans, else Unfollow', async () => {
    const setup = await importedStore();
    const start = () => selectTodoStartView(setup.store.getState());
    expect(start()).toBe(LIST_VIEWS.TO_UNFOLLOW); // nothing queued
    setup.store.dispatch(setPlan({ username: 'dave', type: REMOVE_FOLLOWER, state: PLAN_STATES.DONE }));
    expect(start()).toBe(LIST_VIEWS.TO_REMOVE); // only done plans, all in Remove follower
    setup.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    expect(start()).toBe(LIST_VIEWS.TO_UNFOLLOW); // done plans in both: the first
    setup.store.dispatch(setPlan({ username: 'alice', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    expect(start()).toBe(LIST_VIEWS.TO_REMOVE); // work left wins over done
  });

  test('visible accounts follow scope, decision, tag and search, sorted by username', async () => {
    const setup = await importedStore();
    const keys = () => selectVisibleAccountKeys(setup.store.getState());
    expect(keys()).toEqual(['alice', 'bob', 'carol']); // I follow

    setup.store.dispatch(setScope(REVIEW_SCOPES.FOLLOWERS));
    expect(keys()).toEqual(['alice', 'dave']);
    setup.store.dispatch(setScope(REVIEW_SCOPES.ALL_CURRENT));
    setup.store.dispatch(toggleTag({ username: 'dave', tag: 'artist' }));
    setup.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: 'artist' }));
    expect(keys()).toEqual(['dave']);
    setup.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.UNTAGGED }));
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    setup.store.dispatch(setDecisionFilter(DecisionFilter.NEEDS_DECISION));
    expect(keys()).toEqual(['alice', 'carol']);
    setup.store.dispatch(setQuery(' CAR '));
    expect(keys()).toEqual(['carol']);
  });

  test('Changes sections list what changed since the imported master was saved, regardless of scope', async () => {
    const setup = await importedStore();
    await setup.store.dispatch(saveMaster()).unwrap(); // saved at 12:00
    const saved = JSON.parse(must(setup.downloads[0]).text) as unknown;
    const afterSave = Date.parse('2026-10-27T12:30:00.000Z') / 1000;
    setup.setNow('2026-10-27T13:00:00.000Z');
    await setup.store
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

    setup.store.dispatch(setScope(REVIEW_SCOPES.FOLLOWERS)); // the Review list doesn't narrow Changes
    expect(selectChangeSections(setup.store.getState())).toEqual({
      [FOLLOW_CHANGES.NEW_FOLLOWS]: ['erin'],
      [FOLLOW_CHANGES.UNFOLLOWED]: ['bob', 'carol'],
      [FOLLOW_CHANGES.NEW_FOLLOWERS]: ['erin'],
      [FOLLOW_CHANGES.LOST_FOLLOWERS]: ['dave'],
    });
    expect(selectFollowChangeCounts(setup.store.getState())).toEqual({
      [FOLLOW_CHANGES.NEW_FOLLOWS]: 1,
      [FOLLOW_CHANGES.UNFOLLOWED]: 2,
      [FOLLOW_CHANGES.NEW_FOLLOWERS]: 1,
      [FOLLOW_CHANGES.LOST_FOLLOWERS]: 1,
    });
  });

  test('To do tabs list their plans, queued first, then done; Review filters do not apply', async () => {
    const setup = await importedStore();
    setup.store.dispatch(setPlan({ username: 'alice', type: UNFOLLOW, state: PLAN_STATES.DONE }));
    setup.store.dispatch(setPlan({ username: 'bob', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    setup.store.dispatch(setPlan({ username: 'carol', type: UNFOLLOW, state: PLAN_STATES.PLANNED }));
    setup.store.dispatch(setPlan({ username: 'dave', type: REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED }));
    setup.store.dispatch(setQuery('zzz')); // matches nobody
    setup.store.dispatch(setView(LIST_VIEWS.TO_UNFOLLOW));
    expect(selectVisibleAccountKeys(setup.store.getState())).toEqual(['bob', 'carol', 'alice']);
    setup.store.dispatch(setView(LIST_VIEWS.TO_REMOVE));
    expect(selectVisibleAccountKeys(setup.store.getState())).toEqual(['dave']);
  });

  test('editing one account keeps the list array and other accounts referentially stable', async () => {
    const setup = await importedStore();
    const before = setup.store.getState();
    setup.store.dispatch(setNote({ username: 'bob', note: 'x' }));
    const after = setup.store.getState();
    expect(selectVisibleAccountKeys(after)).toBe(selectVisibleAccountKeys(before));
    expect(selectAccount(after, 'alice')).toBe(selectAccount(before, 'alice'));
    expect(selectAccount(after, 'bob')).not.toBe(selectAccount(before, 'bob'));
  });

  test('per-list totals count each list whatever the other filters; edits never change them', async () => {
    const setup = await importedStore(); // following Alice, bob, carol; followers alice, dave
    const totals = {
      [REVIEW_SCOPES.FOLLOWING]: 3,
      [REVIEW_SCOPES.FOLLOWERS]: 2,
      [REVIEW_SCOPES.MUTUAL]: 1,
      [REVIEW_SCOPES.NOT_FOLLOWING_BACK]: 2,
      [REVIEW_SCOPES.FOLLOWS_YOU_ONLY]: 1,
      [REVIEW_SCOPES.ALL_CURRENT]: 4,
      [REVIEW_SCOPES.ALL_ACCOUNTS]: 4,
    };
    expect(selectScopeTotals(setup.store.getState())).toEqual(totals);
    setup.store.dispatch(setKept({ username: 'bob', kept: true }));
    setup.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.UNTAGGED }));
    setup.store.dispatch(setDecisionFilter(DecisionFilter.KEPT));
    expect(selectScopeTotals(setup.store.getState())).toEqual(totals);
  });

  test('the matching count reads any filters (the Filter popup draft) and leaves the list alone', async () => {
    const setup = await importedStore();
    setup.store.dispatch(setKept({ username: 'alice', kept: true }));
    const state = setup.store.getState();
    const draft = (choice: Partial<typeof state.filters>) =>
      selectMatchingCount(state, { ...state.filters, ...choice });
    expect(draft({})).toBe(3); // Following, as shown
    expect(draft({ scope: REVIEW_SCOPES.FOLLOWERS })).toBe(2);
    expect(draft({ scope: REVIEW_SCOPES.FOLLOWERS, decision: DecisionFilter.NEEDS_DECISION })).toBe(1); // dave
    expect(draft({ scope: REVIEW_SCOPES.ALL_CURRENT, query: 'a' })).toBe(3); // alice, carol, dave
    expect(selectListKeys(state)).toEqual(['alice', 'bob', 'carol']);
  });

  test('selector results are read-only at compile time', async () => {
    const setup = await importedStore();
    const alice = account(setup, 'alice');
    expect(() => {
      // @ts-expect-error state handed to components must not be writable
      alice.review.unavailable = true;
    }).toThrow(TypeError); // and Immer has frozen it at runtime too
  });
});
