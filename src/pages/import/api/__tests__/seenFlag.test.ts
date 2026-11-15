import { SEEN_FLAGS, localStorageSeenFlag } from '../seenFlag.ts';

test('"seen" survives in localStorage, per popup, and tolerates blocked storage', () => {
  window.localStorage.clear();
  expect(localStorageSeenFlag(SEEN_FLAGS.HOW_IT_WORKS, window.localStorage).get()).toBe(false);
  localStorageSeenFlag(SEEN_FLAGS.HOW_IT_WORKS, window.localStorage).set();
  expect(localStorageSeenFlag(SEEN_FLAGS.HOW_IT_WORKS, window.localStorage).get()).toBe(true);
  expect(localStorageSeenFlag(SEEN_FLAGS.INSTALL_HINT, window.localStorage).get()).toBe(false); // each popup its own

  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  expect(localStorageSeenFlag(SEEN_FLAGS.HOW_IT_WORKS, blocked).get()).toBe(false); // opens again, no crash
  expect(() => {
    localStorageSeenFlag(SEEN_FLAGS.HOW_IT_WORKS, blocked).set();
  }).not.toThrow();
  expect(localStorageSeenFlag(SEEN_FLAGS.HOW_IT_WORKS, null).get()).toBe(false); // localStorage not reachable at all
});
