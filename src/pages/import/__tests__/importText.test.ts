import { exportFilesText } from '../importText.ts';

// Noon local time, so the date is the same in every time zone.
const oct29 = new Date(2026, 9, 29, 12).getTime();

describe('exportFilesText', () => {
  test('one file: name, size and date', () => {
    expect(exportFilesText([{ name: 'instagram.zip', size: 2_400_000, lastModified: oct29 }])).toBe(
      'instagram.zip · 2.4 MB · Oct 29, 2026',
    );
  });

  test('small files are shown in kB, never as 0', () => {
    expect(exportFilesText([{ name: 'following.json', size: 12_345, lastModified: oct29 }])).toMatch(/· 12 kB ·/);
    expect(exportFilesText([{ name: 'tiny.json', size: 10, lastModified: oct29 }])).toMatch(/· 1 kB ·/);
  });

  test('loose files are counted', () => {
    const file = { name: 'x.json', size: 1, lastModified: oct29 };
    expect(exportFilesText([file, file, file])).toBe('3 files');
  });
});
