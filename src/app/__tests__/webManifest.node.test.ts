// @vitest-environment node
// The Home Screen install: the manifest is valid and every icon it or index.html names exists, with its size.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const PUBLIC = join(ROOT, 'public');

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
}

const manifest = JSON.parse(readFileSync(join(PUBLIC, 'manifest.webmanifest'), 'utf8')) as {
  name: string;
  short_name: string;
  start_url: string;
  display: string;
  icons: ManifestIcon[];
};

/** Width and height from a PNG file's header (IHDR). */
function pngSize(path: string): string {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString('latin1')).toBe('PNG');
  return `${String(bytes.readUInt32BE(16))}x${String(bytes.readUInt32BE(20))}`;
}

test('the manifest makes the app installable as "Unfollowism", opening without browser bars', () => {
  expect(manifest).toMatchObject({
    name: 'Unfollowism',
    short_name: 'Unfollowism',
    start_url: '/',
    display: 'standalone',
  });
});

test('every manifest icon exists; the PNGs have the sizes they claim, including 192 and 512', () => {
  for (const icon of manifest.icons) {
    const path = join(PUBLIC, icon.src);
    if (icon.type === 'image/png') {
      expect(pngSize(path)).toBe(icon.sizes);
    } else {
      expect(readFileSync(path, 'utf8')).toContain('<svg');
    }
  }
  expect(manifest.icons.map(icon => icon.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
});

test('index.html links the manifest and icons that exist; the iPhone icon is 180x180', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  const links = [...html.matchAll(/<link rel="(icon|apple-touch-icon|manifest)" href="([^"]+)"/g)];
  expect(links.map(([, rel]) => rel).sort()).toEqual(['apple-touch-icon', 'icon', 'icon', 'manifest']);
  for (const [, , href] of links) {
    expect(readFileSync(join(PUBLIC, href ?? '')).length).toBeGreaterThan(0);
  }
  expect(pngSize(join(PUBLIC, 'apple-touch-icon.png'))).toBe('180x180');
});
