import { masterFileName } from '../masterFileName.ts';

test('master file names are timestamped in local time', () => {
  expect(masterFileName(new Date(2026, 9, 7, 4, 5, 9))).toBe('unfollowism_progress_2026-10-07_04-05-09.json');
});
