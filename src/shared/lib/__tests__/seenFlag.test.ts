import { localStorageSeenFlag } from '../seenFlag.ts';

const HOW_IT_WORKS = 'test:how-it-works-seen';
const INSTALL_HINT = 'test:install-hint-seen';

test('"seen" survives in localStorage, per popup, and tolerates blocked storage', () => {
  window.localStorage.clear();
  expect(localStorageSeenFlag(HOW_IT_WORKS, window.localStorage).get()).toBe(false);
  localStorageSeenFlag(HOW_IT_WORKS, window.localStorage).set();
  expect(localStorageSeenFlag(HOW_IT_WORKS, window.localStorage).get()).toBe(true);
  expect(localStorageSeenFlag(INSTALL_HINT, window.localStorage).get()).toBe(false); // each popup its own

  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  expect(localStorageSeenFlag(HOW_IT_WORKS, blocked).get()).toBe(false); // opens again, no crash
  expect(() => {
    localStorageSeenFlag(HOW_IT_WORKS, blocked).set();
  }).not.toThrow();
  expect(localStorageSeenFlag(HOW_IT_WORKS, null).get()).toBe(false); // localStorage not reachable at all
});
