import { persistStorage } from '../persistStorage.ts';

describe('persistStorage', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('asks the browser and passes on its answer', async () => {
    const persist = vi.fn(() => Promise.resolve(true));
    expect(await persistStorage({ persist })).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
    expect(await persistStorage({ persist: () => Promise.resolve(false) })).toBe(false);
  });

  test("a browser without it, or one that fails, just doesn't keep storage", async () => {
    expect(await persistStorage(undefined)).toBe(false);
    expect(await persistStorage({ persist: () => Promise.reject(new Error('denied')) })).toBe(false);
    expect(console.error).toHaveBeenCalledOnce();
  });
});
