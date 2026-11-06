import { activeTab, type TabChannel, type TabLocks } from '../activeTab.ts';

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
  return {
    request,
    /** Lets go of the held lock as iPhone Safari does on a plain reload, with no other tab involved. */
    release: () => holder?.(new DOMException('The page is closing', 'AbortError')),
  };
}

/** Simulated BroadcastChannel between tabs: a message reaches every other tab's channel, not the sender's. */
function fakeChannels() {
  const listeners = new Map<object, (event: MessageEvent) => void>();
  return () => {
    const channel = {
      postMessage(data: unknown) {
        listeners.forEach((listener, other) => {
          if (other !== channel) {
            listener(new MessageEvent('message', { data }));
          }
        });
      },
      addEventListener(_type: string, listener: (event: MessageEvent) => void) {
        listeners.set(channel, listener);
      },
    };
    return channel as unknown as TabChannel;
  };
}

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('active tab', () => {
  test('the first tab becomes active; a second tab is not', async () => {
    const locks = fakeLocks();
    expect(await activeTab(locks, null, vi.fn()).claim()).toBe(true);
    expect(await activeTab(locks, null, vi.fn()).claim()).toBe(false);
  });

  test('Use here takes over: the other tab is told it lost, this one is active', async () => {
    const locks = fakeLocks();
    const channel = fakeChannels();
    const firstLost = vi.fn();
    await activeTab(locks, channel(), firstLost).claim();

    const secondLost = vi.fn();
    const second = activeTab(locks, channel(), secondLost);
    expect(await second.claim()).toBe(false);
    await second.takeOver();
    await flush();
    expect(firstLost).toHaveBeenCalledOnce();
    expect(secondLost).not.toHaveBeenCalled();
    expect(await activeTab(locks, null, vi.fn()).claim()).toBe(false); // the second tab holds it now
  });

  test('the lock let go on a reload, with no other tab taking over: no reload, so no reload loop', async () => {
    const locks = fakeLocks();
    const lost = vi.fn();
    await activeTab(locks, fakeChannels()(), lost).claim();
    locks.release();
    await flush();
    expect(lost).not.toHaveBeenCalled();
  });

  test('a tab that was never active ignores a takeover', async () => {
    const locks = fakeLocks();
    const channel = fakeChannels();
    await activeTab(locks, channel(), vi.fn()).claim();
    const waitingLost = vi.fn();
    expect(await activeTab(locks, channel(), waitingLost).claim()).toBe(false);
    await activeTab(locks, channel(), vi.fn()).takeOver();
    await flush();
    expect(waitingLost).not.toHaveBeenCalled();
  });

  test('without Web Locks every tab works, as before', async () => {
    const tab = activeTab(null, null, vi.fn());
    expect(await tab.claim()).toBe(true);
    await expect(tab.takeOver()).resolves.toBeUndefined();
  });

  test('a browser that refuses the lock (site data blocked): the app still starts', async () => {
    const locks: TabLocks = {
      request: () => Promise.reject(new DOMException('The request was denied.', 'SecurityError')),
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(activeTab(locks, null, vi.fn()).claim()).resolves.toBe(true);
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  test('a browser that refuses to take over: this tab works anyway', async () => {
    const locks: TabLocks = {
      request: () => Promise.reject(new DOMException('steal is not supported', 'NotSupportedError')),
    };
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await expect(activeTab(locks, null, vi.fn()).takeOver()).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });
});
