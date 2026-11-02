import { makeTestStore, prepared } from '@/app/store/__tests__/testStore.ts';
import { selectIsDirty } from '@/entities/master/model/selectors.ts';
import { importPrepared, saveMaster } from '@/entities/master/model/thunks.ts';

import { guardUnload } from '../unloadGuard.ts';

/** Fires beforeunload as the browser does; true when the page asked to confirm leaving. */
function leaveBlocked(): boolean {
  const event = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
}

describe('guardUnload', () => {
  test('asks to confirm leaving only while there is unsaved work', async () => {
    const { store } = makeTestStore();
    const stop = guardUnload(store, () => selectIsDirty(store.getState()));
    expect(leaveBlocked()).toBe(false); // nothing loaded

    await store.dispatch(importPrepared(prepared())).unwrap(); // a new master, not downloaded yet
    expect(leaveBlocked()).toBe(true);

    await store.dispatch(saveMaster()).unwrap();
    expect(leaveBlocked()).toBe(false);
    stop();
  });

  test('stopping removes the guard', async () => {
    const { store } = makeTestStore();
    await store.dispatch(importPrepared(prepared())).unwrap();
    const stop = guardUnload(store, () => selectIsDirty(store.getState()));
    expect(leaveBlocked()).toBe(true);
    stop();
    expect(leaveBlocked()).toBe(false);
  });
});
