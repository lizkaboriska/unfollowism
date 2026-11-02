import {
  ACTION_TYPES,
  DecisionFilter,
  PLAN_STATES,
  REVIEW_SCOPES,
  TAG_FILTER_KINDS,
} from '@/entities/master/lib/index.ts';
import { memoryAddressBar } from '@/shared/url/addressBar.ts';

import type { TabStore } from '../../io/tabStore.ts';
import { LIST_VIEWS, setQuery, setScope, setView } from '../filtersSlice.ts';
import type { AppStore } from '../index.ts';
import { renameTag, setPlan, toggleTag } from '../masterSlice.ts';
import { importPrepared, restoreTab } from '../thunks.ts';
import { addressChanged } from '../urlSync.ts';

import { flushPersistence, makeTestStore, prepared } from './testStore.ts';

// prepared(): following Alice, bob, carol; followers alice, dave.

/** A tab with stored work: alice tagged "friends", plus whatever `edit` does. */
async function storedTab(edit: (store: AppStore) => void = () => undefined): Promise<TabStore> {
  const t = makeTestStore();
  await t.store.dispatch(importPrepared(prepared())).unwrap();
  t.store.dispatch(toggleTag({ username: 'alice', tag: 'friends' }));
  edit(t.store);
  await flushPersistence();
  return t.tab;
}

/** A fresh page at `url` over `tab`, after the restore. */
async function reloadAt(url: string, tab: TabStore) {
  const address = memoryAddressBar(url);
  const t = makeTestStore({ tab, address });
  address.onBackOrForward(() => t.store.dispatch(addressChanged())); // as the app does
  await t.store.dispatch(restoreTab());
  return { store: t.store, address };
}

describe('URL sync', () => {
  test('a reload shows the page and filters the URL asks for, keeping the URL', async () => {
    const tab = await storedTab();
    const url = '/?list=followers&decision=undecided&tag=friends&q=al';
    const { store, address } = await reloadAt(url, tab);
    expect(store.getState().filters).toEqual({
      view: LIST_VIEWS.REVIEW,
      scope: REVIEW_SCOPES.FOLLOWERS,
      decision: DecisionFilter.NEEDS_DECISION,
      tag: { kind: TAG_FILTER_KINDS.TAG, tag: 'friends' },
      query: 'al',
    });
    expect(address.url).toBe(url);

    expect((await reloadAt('/changes', tab)).store.getState().filters.view).toBe(LIST_VIEWS.CHANGES);
    expect((await reloadAt('/todo/remove', tab)).store.getState().filters.view).toBe(LIST_VIEWS.TO_REMOVE);
  });

  test('plain /todo opens the tab To do would pick, and the URL names it', async () => {
    const tab = await storedTab(store =>
      store.dispatch(setPlan({ username: 'dave', type: ACTION_TYPES.REMOVE_FOLLOWER, state: PLAN_STATES.PLANNED })),
    );
    const { store, address } = await reloadAt('/todo', tab);
    expect(store.getState().filters.view).toBe(LIST_VIEWS.TO_REMOVE);
    expect(address.url).toBe('/todo/remove');
  });

  test('what the URL gets wrong is dropped from it; a tag no longer there becomes All tags', async () => {
    const tab = await storedTab();
    expect((await reloadAt('/?list=nope&q=x&foo=1', tab)).address.url).toBe('/?q=x');
    expect((await reloadAt('/nowhere?q=x', tab)).address.url).toBe('/?q=x');
    const { store, address } = await reloadAt('/?tag=gone&q=a', tab);
    expect(store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.ALL });
    expect(address.url).toBe('/?q=a');
  });

  test('no work to restore: Welcome, and the URL goes back to "/"', async () => {
    const empty = await reloadAt('/changes?q=x', makeTestStore().tab);
    expect(empty.store.getState().filters.view).toBe(LIST_VIEWS.REVIEW);
    expect(empty.address.url).toBe('/');

    const broken: TabStore = { ...makeTestStore().tab, load: () => Promise.reject(new Error('unreadable')) };
    expect((await reloadAt('/todo/remove', broken)).address.url).toBe('/');
  });

  test('nothing is written before the restore; afterwards every page and filter change is', async () => {
    const address = memoryAddressBar('/changes');
    const t = makeTestStore({ tab: await storedTab(), address });
    t.store.dispatch(setScope(REVIEW_SCOPES.MUTUAL)); // before the restore
    expect(address.url).toBe('/changes');

    await t.store.dispatch(restoreTab());
    t.store.dispatch(setView(LIST_VIEWS.REVIEW));
    t.store.dispatch(setScope(REVIEW_SCOPES.FOLLOWERS));
    t.store.dispatch(setQuery('al b'));
    expect(address.url).toBe('/?list=followers&q=al+b');
    t.store.dispatch(setView(LIST_VIEWS.TO_UNFOLLOW));
    expect(address.url).toBe('/todo/unfollow');
    t.store.dispatch(setView(LIST_VIEWS.REVIEW));
    expect(address.url).toBe('/?list=followers&q=al+b'); // Review's filters come back with it
  });

  test('the tag in the URL follows a rename', async () => {
    const { store, address } = await reloadAt('/?tag=friends', await storedTab());
    store.dispatch(renameTag({ from: 'friends', to: 'close friends' }));
    expect(address.url).toBe('/?tag=close+friends');
  });

  test('a second restore (React development runs effects twice) leaves the screen alone', async () => {
    const { store, address } = await reloadAt('/changes', await storedTab());
    store.dispatch(setView(LIST_VIEWS.REVIEW));
    await store.dispatch(restoreTab());
    expect(store.getState().filters.view).toBe(LIST_VIEWS.REVIEW);
    expect(address.url).toBe('/');
  });

  test('a page change adds a Back step; a filter change rewrites the current one', async () => {
    const { store, address } = await reloadAt('/', await storedTab());
    store.dispatch(setScope(REVIEW_SCOPES.FOLLOWERS));
    store.dispatch(setQuery('al'));
    expect(address.steps).toEqual(['/?list=followers&q=al']);
    store.dispatch(setView(LIST_VIEWS.CHANGES));
    store.dispatch(setView(LIST_VIEWS.TO_UNFOLLOW));
    store.dispatch(setView(LIST_VIEWS.TO_REMOVE)); // the To do tabs are pages too
    expect(address.steps).toEqual(['/?list=followers&q=al', '/changes', '/todo/unfollow', '/todo/remove']);
  });

  test("Back and Forward show that step's page; Review gets that step's filters, other pages keep them", async () => {
    const { store, address } = await reloadAt('/?list=followers', await storedTab());
    const filters = () => store.getState().filters;
    store.dispatch(setView(LIST_VIEWS.CHANGES));
    store.dispatch(setView(LIST_VIEWS.REVIEW));
    store.dispatch(setScope(REVIEW_SCOPES.MUTUAL));
    store.dispatch(setView(LIST_VIEWS.CHANGES));
    const steps = ['/?list=followers', '/changes', '/?list=mutual', '/changes'];
    expect(address.steps).toEqual(steps);

    address.back();
    expect(filters()).toMatchObject({ view: LIST_VIEWS.REVIEW, scope: REVIEW_SCOPES.MUTUAL });
    address.back();
    expect(filters()).toMatchObject({ view: LIST_VIEWS.CHANGES, scope: REVIEW_SCOPES.MUTUAL });
    address.back();
    expect(filters()).toMatchObject({ view: LIST_VIEWS.REVIEW, scope: REVIEW_SCOPES.FOLLOWERS });
    address.forward();
    expect(filters()).toMatchObject({ view: LIST_VIEWS.CHANGES, scope: REVIEW_SCOPES.FOLLOWERS });
    expect(address.steps).toEqual(steps); // moving through the steps adds none
  });

  test('Back to a step whose URL is no longer right corrects it in place', async () => {
    const { store, address } = await reloadAt('/', await storedTab());
    address.push('/todo'); // e.g. typed by hand earlier
    address.push('/?tag=gone');
    address.back();
    expect(store.getState().filters.view).toBe(LIST_VIEWS.TO_UNFOLLOW);
    expect(address.url).toBe('/todo/unfollow');
    address.forward();
    expect(store.getState().filters).toMatchObject({ view: LIST_VIEWS.REVIEW, tag: { kind: TAG_FILTER_KINDS.ALL } });
    expect(address.steps).toEqual(['/', '/todo/unfollow', '/']);
  });

  test('Back on Welcome (no work yet) changes nothing', async () => {
    const { store, address } = await reloadAt('/', makeTestStore().tab);
    address.push('/changes');
    address.back();
    expect(store.getState().filters.view).toBe(LIST_VIEWS.REVIEW);
    expect(address.steps).toEqual(['/', '/changes']);
  });
});
