import { IDBDatabase, IDBFactory, IDBKeyRange } from 'fake-indexeddb';

import { must } from '../../lib/__tests__/helpers.ts';
import { DecisionKind } from '../../lib/types.ts';
import { createMemoryTabDatabase, openIndexedDbTabDatabase, type BackupWrites } from '../backupStore.ts';

import { BASE, META, NOTHING, edited } from './backupFixtures.ts';

describe.each([
  ['IndexedDB', () => openIndexedDbTabDatabase(new IDBFactory(), IDBKeyRange)],
  ['memory', () => createMemoryTabDatabase()],
])('%s backup store', (_, open) => {
  test('stores the base once and changed accounts on top; tabs are isolated', async () => {
    const db = open();
    const tab = db.forTab('a');
    expect(await tab.load()).toBeNull();

    await tab.replace(BASE, META, NOTHING);
    await tab.update(
      { ...META, revision: 3 },
      edited({ bob: { username: 'bob', decision: { kind: DecisionKind.KEPT } } }),
    );
    await tab.update({ ...META, revision: 4 }, edited({ constructor: { username: 'constructor', followerSince: 5 } }));

    const loaded = must(await tab.load());
    expect(loaded.base).toEqual(BASE);
    expect(loaded.meta.revision).toBe(4);
    expect(Object.keys(loaded.changed).sort()).toEqual(['bob', 'constructor']);
    const key: string = 'constructor';
    expect(loaded.changed[key]).toEqual({ username: 'constructor', followerSince: 5 });
    expect(loaded.saved).toEqual({});

    expect(await db.forTab('b').load()).toBeNull();
    expect(await db.tabIds()).toEqual(['a']);
  });

  test('a removed account (null record) is kept and read back as null', async () => {
    const tab = open().forTab('a');
    await tab.replace(BASE, META, { changed: { bob: null }, saved: {} });
    await tab.update(META, { changed: {}, removed: [], saved: { bob: null } });
    const loaded = must(await tab.load());
    expect(Object.keys(loaded.changed)).toEqual(['bob']);
    expect(loaded.changed.bob).toBeNull();
    expect(loaded.saved.bob).toBeNull();
  });

  test('an account keyed __proto__ comes back as an ordinary account', async () => {
    const tab = open().forTab('a');
    // a literal would set the prototype
    const records = JSON.parse('{"__proto__":{"username":"__proto__"}}') as BackupWrites['changed'];
    await tab.replace(BASE, META, { changed: records, saved: records });
    const loaded = must(await tab.load());
    expect(Object.keys(loaded.changed)).toEqual(['__proto__']);
    expect(Object.keys(loaded.saved)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(loaded.changed, '__proto__')?.value).toEqual({ username: '__proto__' });
  });

  test("replace drops the tab's earlier changes", async () => {
    const tab = open().forTab('a');
    await tab.replace(BASE, META, NOTHING);
    await tab.update(META, { changed: { bob: { username: 'bob' } }, removed: [], saved: { bob: { username: 'bob' } } });
    await tab.replace(BASE, META, NOTHING);
    const loaded = must(await tab.load());
    expect(loaded.changed).toEqual({});
    expect(loaded.saved).toEqual({});
  });

  test('keeps saved versions next to changed ones; a reset removes accounts that are no longer changed', async () => {
    const tab = open().forTab('a');
    await tab.replace(BASE, META, NOTHING);
    await tab.update(META, edited({ bob: { username: 'bob', followerSince: 1 } }));
    await tab.update(META, { changed: {}, removed: [], saved: { bob: { username: 'bob', followerSince: 1 } } }); // save
    await tab.update(
      META,
      edited({ bob: { username: 'bob', followerSince: 2 }, constructor: { username: 'constructor' } }),
    );
    await tab.update(META, {
      changed: { bob: { username: 'bob', followerSince: 1 } },
      removed: ['constructor'],
      saved: {},
    }); // reset

    const loaded = must(await tab.load());
    expect(loaded.changed).toEqual({ bob: { username: 'bob', followerSince: 1 } });
    expect(loaded.saved).toEqual({ bob: { username: 'bob', followerSince: 1 } });
  });

  test('an update with nothing stored yet fails instead of writing a partial tab', async () => {
    await expect(open().forTab('a').update(META, edited({}))).rejects.toThrow();
  });

  test('copy and delete work per tab', async () => {
    const db = open();
    await db.forTab('a').replace(BASE, META, NOTHING);
    await db
      .forTab('a')
      .update(META, { changed: { bob: { username: 'bob' } }, removed: [], saved: { alice: { username: 'alice' } } });
    await db.copyTab('a', 'b');
    await db.deleteTab('a');
    expect(await db.tabIds()).toEqual(['b']);
    const copy = must(await db.forTab('b').load());
    expect(Object.keys(copy.changed)).toEqual(['bob']);
    expect(Object.keys(copy.saved)).toEqual(['alice']);
    expect(await db.forTab('a').load()).toBeNull();
  });
});

describe('IndexedDB backup store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('an edit writes the meta and accounts, never the stored master', async () => {
    const tab = openIndexedDbTabDatabase(new IDBFactory(), IDBKeyRange).forTab('a');
    await tab.replace(BASE, META, NOTHING);
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    await tab.update({ ...META, revision: 3 }, edited({ bob: { username: 'bob' } }));
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[0]).not.toContain('tabs');
  });

  test('data from an older database version is dropped, not migrated', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const open = factory.open('unfollowism', 4);
      open.onupgradeneeded = () => {
        const database = open.result;
        database.createObjectStore('tabs').put(BASE, 'a');
        database.createObjectStore('meta').put(META, 'a');
        database.createObjectStore('accounts').put({ username: 'bob' }, ['a', 'bob']);
        database.createObjectStore('savedAccounts');
      };
      open.onsuccess = () => {
        open.result.close();
        resolve();
      };
      open.onerror = () => {
        reject(open.error ?? new Error('open failed'));
      };
    });

    const tab = openIndexedDbTabDatabase(factory, IDBKeyRange).forTab('a');
    expect(await tab.load()).toBeNull();
    await tab.replace(BASE, META, NOTHING);
    expect(must(await tab.load()).base).toEqual(BASE);
  });
});
