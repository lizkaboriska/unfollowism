import { RELOAD_COOLDOWN_MS, reloadOnce } from '../reloadOnce.ts';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>();
  return {
    getItem: key => items.get(key) ?? null,
    setItem: (key, value) => {
      items.set(key, value);
    },
  };
}

describe('reloadOnce', () => {
  test('reloads, then not again within the cooldown, then again after it', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    let time = 1_000_000;
    const now = () => time;

    expect(reloadOnce({ storage, now, reload })).toBe(true);
    time += RELOAD_COOLDOWN_MS - 1;
    expect(reloadOnce({ storage, now, reload })).toBe(false);
    time += 1;
    expect(reloadOnce({ storage, now, reload })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  test('never reloads when sessionStorage is blocked, so it cannot loop', () => {
    const reload = vi.fn();
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    const readOnly = { getItem: () => null, setItem: throwing.setItem };

    expect(reloadOnce({ storage: null, reload })).toBe(false);
    expect(reloadOnce({ storage: throwing, reload })).toBe(false);
    expect(reloadOnce({ storage: readOnly, reload })).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
