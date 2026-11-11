import { flushPersistence, makeTestStore, prepared, recordingBackup } from '@/app/store/__tests__/testStore.ts';
import { importPrepared, persistenceFailed, saveMaster, setNote } from '@/entities/master';

import { handleTakenOver } from '../takenOver.ts';

function actions() {
  return { stopGuard: vi.fn(), reload: vi.fn(), showStopped: vi.fn() };
}

/** A store with one unsaved edit. */
async function editedStore() {
  const recorded = recordingBackup();
  const testStore = makeTestStore({ backup: recorded.backup });
  await testStore.store.dispatch(importPrepared(prepared())).unwrap();
  testStore.store.dispatch(setNote({ username: 'bob', note: 'unsaved' }));
  await flushPersistence();
  return { ...testStore, writes: recorded.writes };
}

test('stored work: reloads without "Leave site?"', async () => {
  const { store } = await editedStore();
  const spies = actions();
  handleTakenOver(store, true, spies);
  expect(spies.stopGuard).toHaveBeenCalledOnce();
  expect(spies.reload).toHaveBeenCalledOnce();
  expect(spies.showStopped).not.toHaveBeenCalled();
});

test('still starting: reloads', () => {
  const spies = actions();
  handleTakenOver(null, false, spies);
  expect(spies.reload).toHaveBeenCalledOnce();
  expect(spies.showStopped).not.toHaveBeenCalled();
});

test('storage off with unsaved work: no reload, This tab stopped, nothing more written', async () => {
  const { store, writes } = await editedStore();
  const spies = actions();
  handleTakenOver(store, false, spies);
  expect(spies.reload).not.toHaveBeenCalled();
  expect(spies.stopGuard).not.toHaveBeenCalled();
  expect(spies.showStopped).toHaveBeenCalledExactlyOnceWith(store);

  const writeCountBefore = writes.length;
  store.dispatch(setNote({ username: 'bob', note: 'after' }));
  await flushPersistence();
  expect(writes).toHaveLength(writeCountBefore);
});

test('writes failing with unsaved work: This tab stopped', async () => {
  const { store } = await editedStore();
  store.dispatch(persistenceFailed());
  const spies = actions();
  handleTakenOver(store, true, spies);
  expect(spies.reload).not.toHaveBeenCalled();
  expect(spies.showStopped).toHaveBeenCalledExactlyOnceWith(store);
});

test('storage off but everything saved: reloads', async () => {
  const { store } = await editedStore();
  await store.dispatch(saveMaster()).unwrap();
  const spies = actions();
  handleTakenOver(store, false, spies);
  expect(spies.reload).toHaveBeenCalledOnce();
  expect(spies.showStopped).not.toHaveBeenCalled();
});
