import { localStorageHowItWorksSeen } from '../howItWorksSeen.ts';

test('How it works "seen" survives in localStorage and tolerates blocked storage', () => {
  window.localStorage.clear();
  expect(localStorageHowItWorksSeen(window.localStorage).get()).toBe(false);
  localStorageHowItWorksSeen(window.localStorage).set();
  expect(localStorageHowItWorksSeen(window.localStorage).get()).toBe(true);

  const blocked = {
    getItem: () => {
      throw new Error('blocked');
    },
    setItem: () => {
      throw new Error('blocked');
    },
  };
  expect(localStorageHowItWorksSeen(blocked).get()).toBe(false); // opens again, no crash
  expect(() => {
    localStorageHowItWorksSeen(blocked).set();
  }).not.toThrow();
  expect(localStorageHowItWorksSeen(null).get()).toBe(false); // localStorage not reachable at all
});
