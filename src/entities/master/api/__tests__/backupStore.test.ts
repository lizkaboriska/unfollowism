import { IDBDatabase, IDBFactory } from 'fake-indexeddb';

import { must } from '../../lib/__tests__/helpers.ts';
import { DecisionKind } from '../../lib/types.ts';
import { createMemoryBackupStore, openIndexedDbBackupStore, type BackupWrites } from '../backupStore.ts';

import { BASE, META, NOTHING, edited } from './backupFixtures.ts';

describe.each([
  ['IndexedDB', () => openIndexedDbBackupStore(new IDBFactory())],
  ['memory', () => Promise.resolve(createMemoryBackupStore())],
])('%s backup store', (_, open) => {
  test('stores the base once and changed accounts on top', async () => {
    const backup = await open();
    expect(await backup.load()).toBeNull();

    await backup.replace(BASE, META, NOTHING);
    await backup.update(
      { ...META, revision: 3 },
      edited({ bob: { username: 'bob', decision: { kind: DecisionKind.KEPT } } }),
    );
    await backup.update(
      { ...META, revision: 4 },
      edited({ constructor: { username: 'constructor', followerSince: 5 } }),
    );

    const loaded = must(await backup.load());
    expect(loaded.base).toEqual(BASE);
    expect(loaded.meta.revision).toBe(4);
    expect(Object.keys(loaded.changed).sort()).toEqual(['bob', 'constructor']);
    const key: string = 'constructor';
    expect(loaded.changed[key]).toEqual({ username: 'constructor', followerSince: 5 });
    expect(loaded.saved).toEqual({});
  });

  test('a removed account (null record) is kept and read back as null', async () => {
    const backup = await open();
    await backup.replace(BASE, META, { changed: { bob: null }, saved: {} });
    await backup.update(META, { changed: {}, removed: [], saved: { bob: null } });
    const loaded = must(await backup.load());
    expect(Object.keys(loaded.changed)).toEqual(['bob']);
    expect(loaded.changed.bob).toBeNull();
    expect(loaded.saved.bob).toBeNull();
  });

  test('an account keyed __proto__ comes back as an ordinary account', async () => {
    const backup = await open();
    // a literal would set the prototype
    const records = JSON.parse('{"__proto__":{"username":"__proto__"}}') as BackupWrites['changed'];
    await backup.replace(BASE, META, { changed: records, saved: records });
    const loaded = must(await backup.load());
    expect(Object.keys(loaded.changed)).toEqual(['__proto__']);
    expect(Object.keys(loaded.saved)).toEqual(['__proto__']);
    expect(Object.getOwnPropertyDescriptor(loaded.changed, '__proto__')?.value).toEqual({ username: '__proto__' });
  });

  test('replace drops the earlier changes', async () => {
    const backup = await open();
    await backup.replace(BASE, META, NOTHING);
    await backup.update(META, {
      changed: { bob: { username: 'bob' } },
      removed: [],
      saved: { bob: { username: 'bob' } },
    });
    await backup.replace(BASE, META, NOTHING);
    const loaded = must(await backup.load());
    expect(loaded.changed).toEqual({});
    expect(loaded.saved).toEqual({});
  });

  test('keeps saved versions next to changed ones; a reset removes accounts that are no longer changed', async () => {
    const backup = await open();
    await backup.replace(BASE, META, NOTHING);
    await backup.update(META, edited({ bob: { username: 'bob', followerSince: 1 } }));
    // save
    await backup.update(META, { changed: {}, removed: [], saved: { bob: { username: 'bob', followerSince: 1 } } });
    await backup.update(
      META,
      edited({ bob: { username: 'bob', followerSince: 2 }, constructor: { username: 'constructor' } }),
    );
    await backup.update(META, {
      changed: { bob: { username: 'bob', followerSince: 1 } },
      removed: ['constructor'],
      saved: {},
    }); // reset

    const loaded = must(await backup.load());
    expect(loaded.changed).toEqual({ bob: { username: 'bob', followerSince: 1 } });
    expect(loaded.saved).toEqual({ bob: { username: 'bob', followerSince: 1 } });
  });

  test('an update with nothing stored yet fails instead of writing a partial backup', async () => {
    await expect((await open()).update(META, edited({}))).rejects.toThrow();
  });
});

describe('IndexedDB backup store', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('an edit writes the meta and accounts, never the stored master', async () => {
    const backup = await openIndexedDbBackupStore(new IDBFactory());
    await backup.replace(BASE, META, NOTHING);
    const transaction = vi.spyOn(IDBDatabase.prototype, 'transaction');
    await backup.update({ ...META, revision: 3 }, edited({ bob: { username: 'bob' } }));
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(transaction.mock.calls[0]?.[0]).not.toContain('base');
  });

  test('data from an older database version is dropped, not migrated', async () => {
    const factory = new IDBFactory();
    await new Promise<void>((resolve, reject) => {
      const open = factory.open('unfollowism', 6); // the old per-tab layout
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

    const backup = await openIndexedDbBackupStore(factory);
    expect(await backup.load()).toBeNull();
    await backup.replace(BASE, META, NOTHING);
    expect(must(await backup.load()).base).toEqual(BASE);
  });
});
