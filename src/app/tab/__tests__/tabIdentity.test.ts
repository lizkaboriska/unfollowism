import { createMemoryTabDatabase } from '@/entities/master';
import { BASE, META, NOTHING } from '@/entities/master/api/__tests__/backupFixtures.ts';
import { must } from '@/entities/master/lib/__tests__/helpers.ts';

import { claimTab, type TabEnvironment } from '../tabIdentity.ts';

/** Simulated browser: sessionStorage per tab, Web Locks shared by all tabs. */
function fakeBrowser() {
  const held = new Set<string>();
  const locks = {
    request: ((
      name: string,
      _options: { ifAvailable: boolean },
      callback: (lock: { name: string } | null) => unknown,
    ) => {
      if (held.has(name)) {
        return Promise.resolve(callback(null));
      }
      held.add(name);
      return Promise.resolve(callback({ name }));
    }) as unknown as LockManager['request'],
    query: () => Promise.resolve({ held: [...held].map(name => ({ name })), pending: [] }),
  };
  let counter = 0;
  const tab = (
    session = new Map<string, string>(),
  ): TabEnvironment & { session: Map<string, string> & Pick<Storage, 'getItem' | 'setItem'> } => {
    const storage = Object.assign(session, {
      getItem: (key: string) => session.get(key) ?? null,
      setItem: (key: string, value: string) => {
        session.set(key, value);
      },
    });
    return { session: storage, locks, newId: () => `id-${++counter}` };
  };
  return {
    tab,
    close: (id: string) => {
      held.delete(`unfollowism:tab:${id}`);
    },
  };
}

describe('tab identity', () => {
  test("reload keeps the tab's id (and data); closing the tab lets the next start clean it up", async () => {
    const db = createMemoryTabDatabase();
    const browser = fakeBrowser();
    const env = browser.tab();

    const id = await claimTab(db, env);
    await db.forTab(id).replace(BASE, META, NOTHING);

    browser.close(id); // reload: the old page releases its lock…
    expect(await claimTab(db, env)).toBe(id); // …and the new page gets the same id back
    expect(await db.forTab(id).load()).not.toBeNull();

    browser.close(id); // the tab is closed for good (its sessionStorage is gone)
    const other = await claimTab(db, browser.tab());
    expect(other).not.toBe(id);
    expect(await db.tabIds()).toEqual([]); // the closed tab's data was removed
  });

  test('a duplicated tab gets its own id and a copy of the data; the original is untouched', async () => {
    const db = createMemoryTabDatabase();
    const browser = fakeBrowser();
    const original = browser.tab();
    const id = await claimTab(db, original);
    await db.forTab(id).replace(BASE, META, NOTHING);

    const duplicate = browser.tab(new Map(original.session)); // "Duplicate tab" copies sessionStorage
    const copyId = await claimTab(db, duplicate);
    expect(copyId).not.toBe(id);
    expect(must(await db.forTab(copyId).load()).base).toEqual(BASE);
    expect((await db.tabIds()).sort()).toEqual([id, copyId].sort());
  });

  test("without Web Locks it still works, it just can't clean up", async () => {
    const db = createMemoryTabDatabase();
    await db.forTab('old').replace(BASE, META, NOTHING);
    const env = { ...fakeBrowser().tab(), locks: null };
    const id = await claimTab(db, env);
    expect(await claimTab(db, env)).toBe(id);
    expect((await db.tabIds()).sort()).toEqual(['old']);
  });
});
