import { flushPersistence, makeTestStore, prepared, recordingBackup } from '@/app/store/__tests__/testStore.ts';
import { importPrepared, persistenceFailed, saveMaster, setNote } from '@/entities/master';

import { handleTakenOver } from '../takenOver.ts';

function actions() {
  return { stopGuard: vi.fn(), reload: vi.fn(), showStopped: vi.fn() };
}

/** A store with one unsaved edit. */
async function editedStore() {
  const recorded = recordingBackup();
  const t = makeTestStore({ backup: recorded.backup });
  await t.store.dispatch(importPrepared(prepared())).unwrap();
  t.store.dispatch(setNote({ username: 'bob', note: 'unsaved' }));
  await flushPersistence();
  return { ...t, writes: recorded.writes };
}

test('stored work: reloads without "Leave site?"', async () => {
  const t = await editedStore();
  const a = actions();
  handleTakenOver(t.store, true, a);
  expect(a.stopGuard).toHaveBeenCalledOnce();
  expect(a.reload).toHaveBeenCalledOnce();
  expect(a.showStopped).not.toHaveBeenCalled();
});

test('still starting: reloads', () => {
  const a = actions();
  handleTakenOver(null, false, a);
  expect(a.reload).toHaveBeenCalledOnce();
  expect(a.showStopped).not.toHaveBeenCalled();
});

test('storage off with unsaved work: no reload, This tab stopped, nothing more written', async () => {
  const t = await editedStore();
  const a = actions();
  handleTakenOver(t.store, false, a);
  expect(a.reload).not.toHaveBeenCalled();
  expect(a.stopGuard).not.toHaveBeenCalled();
  expect(a.showStopped).toHaveBeenCalledExactlyOnceWith(t.store);

  const writes = t.writes.length;
  t.store.dispatch(setNote({ username: 'bob', note: 'after' }));
  await flushPersistence();
  expect(t.writes).toHaveLength(writes);
});

test('writes failing with unsaved work: This tab stopped', async () => {
  const t = await editedStore();
  t.store.dispatch(persistenceFailed());
  const a = actions();
  handleTakenOver(t.store, true, a);
  expect(a.reload).not.toHaveBeenCalled();
  expect(a.showStopped).toHaveBeenCalledExactlyOnceWith(t.store);
});

test('storage off but everything saved: reloads', async () => {
  const t = await editedStore();
  await t.store.dispatch(saveMaster()).unwrap();
  const a = actions();
  handleTakenOver(t.store, false, a);
  expect(a.reload).toHaveBeenCalledOnce();
  expect(a.showStopped).not.toHaveBeenCalled();
});
