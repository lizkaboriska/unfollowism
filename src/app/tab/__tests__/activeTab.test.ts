import { activeTab, type TabLocks } from '../activeTab.ts';

/** Simulated Web Locks shared by all tabs: one lock name is enough here. */
function fakeLocks() {
  let holder: ((error: Error) => void) | null = null;
  const request = ((
    _name: string,
    options: LockOptions,
    callback: (lock: { name: string } | null) => Promise<void> | undefined,
  ) => {
    if (holder && options.ifAvailable) {
      return Promise.resolve(callback(null));
    }
    if (holder && options.steal) {
      holder(new DOMException('The lock was stolen', 'AbortError'));
    }
    return new Promise<void>((_resolve, reject) => {
      holder = reject;
      void callback({ name: 'lock' });
    });
  }) as unknown as LockManager['request'];
  return { request };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('active tab', () => {
  test('the first tab becomes active; a second tab is not', async () => {
    const locks = fakeLocks();
    expect(await activeTab(locks, vi.fn()).claim()).toBe(true);
    expect(await activeTab(locks, vi.fn()).claim()).toBe(false);
  });

  test('Use here takes over: the other tab is told it lost, this one is active', async () => {
    const locks = fakeLocks();
    const firstLost = vi.fn();
    await activeTab(locks, firstLost).claim();

    const secondLost = vi.fn();
    const second = activeTab(locks, secondLost);
    expect(await second.claim()).toBe(false);
    await second.takeOver();
    await flush();
    expect(firstLost).toHaveBeenCalledOnce();
    expect(secondLost).not.toHaveBeenCalled();
    expect(await activeTab(locks, vi.fn()).claim()).toBe(false); // the second tab holds it now
  });

  test('without Web Locks every tab works, as before', async () => {
    const tab = activeTab(null, vi.fn());
    expect(await tab.claim()).toBe(true);
    await expect(tab.takeOver()).resolves.toBeUndefined();
  });

  test('a browser that refuses to take over: this tab works anyway', async () => {
    const locks: TabLocks = {
      request: () => Promise.reject(new DOMException('steal is not supported', 'NotSupportedError')),
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(activeTab(locks, vi.fn()).takeOver()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
