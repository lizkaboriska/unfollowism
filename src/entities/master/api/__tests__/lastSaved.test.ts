import { localStorageLastSaved } from '../lastSaved.ts';

test('last-saved time survives in localStorage and tolerates blocked storage', () => {
  const store = localStorageLastSaved(window.localStorage);
  store.set('2026-10-27T12:00:00Z');
  expect(localStorageLastSaved(window.localStorage).get()).toBe('2026-10-27T12:00:00Z');
  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  expect(localStorageLastSaved(blocked).get()).toBeNull();
  expect(() => {
    localStorageLastSaved(blocked).set('x');
  }).not.toThrow();
});
