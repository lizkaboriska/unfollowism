import { flushPersistence, makeTestStore, prepared, recordingBackup } from '@/app/store/__tests__/testStore.ts';
import { importPrepared, persistenceFailed, saveMaster, setNote } from '@/entities/master';

import { handleTakenOver } from '../takenOver.ts';

function actions() {
  return { stopGuard: vi.fn(), reload: vi.fn(), showStopped: vi.fn() };
}

/** A store with one unsaved edit. */
async function editedStore() {
  const recorded = recordingBackup();
  const setup = makeTestStore({ backup: recorded.backup });
  await setup.store.dispatch(importPrepared(prepared())).unwrap();
  setup.store.dispatch(setNote({ username: 'bob', note: 'unsaved' }));
  await flushPersistence();
  return { ...setup, writes: recorded.writes };
}

test('stored work: reloads without "Leave site?"', async () => {
  const setup = await editedStore();
  const spies = actions();
  handleTakenOver(setup.store, true, spies);
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
  const setup = await editedStore();
  const spies = actions();
  handleTakenOver(setup.store, false, spies);
  expect(spies.reload).not.toHaveBeenCalled();
  expect(spies.stopGuard).not.toHaveBeenCalled();
  expect(spies.showStopped).toHaveBeenCalledExactlyOnceWith(setup.store);

  const writes = setup.writes.length;
  setup.store.dispatch(setNote({ username: 'bob', note: 'after' }));
  await flushPersistence();
  expect(setup.writes).toHaveLength(writes);
});

test('writes failing with unsaved work: This tab stopped', async () => {
  const setup = await editedStore();
  setup.store.dispatch(persistenceFailed());
  const spies = actions();
  handleTakenOver(setup.store, true, spies);
  expect(spies.reload).not.toHaveBeenCalled();
  expect(spies.showStopped).toHaveBeenCalledExactlyOnceWith(setup.store);
});

test('storage off but everything saved: reloads', async () => {
  const setup = await editedStore();
  await setup.store.dispatch(saveMaster()).unwrap();
  const spies = actions();
  handleTakenOver(setup.store, false, spies);
  expect(spies.reload).toHaveBeenCalledOnce();
  expect(spies.showStopped).not.toHaveBeenCalled();
});
