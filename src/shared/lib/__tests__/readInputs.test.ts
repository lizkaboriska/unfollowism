import { TextReader, Uint8ArrayReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';

import { followersFile, followingFile } from '@/entities/master/lib/__tests__/helpers.ts';

import { readInputs } from '../readInputs.ts';

const following = JSON.stringify(followingFile(['alice'], ['bob']));
const followers1 = JSON.stringify(followersFile(['alice']));
const DIR = 'instagram-me-2026/connections/followers_and_following';

/** Bytes rather than a Blob: zip.js builds Blobs with Node's Response, and jsdom's File doesn't accept those. */
async function zipOf(entries: Record<string, string | Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
  const writer = new ZipWriter(new Uint8ArrayWriter(), { useWebWorkers: false });
  for (const [name, content] of Object.entries(entries)) {
    await writer.add(name, typeof content === 'string' ? new TextReader(content) : new Uint8ArrayReader(content));
  }
  return writer.close();
}

describe('readInputs', () => {
  test('expands an Instagram zip: JSON is read, HTML only by name, media and macOS metadata skipped', async () => {
    const zip = await zipOf({
      [`${DIR}/following.json`]: following,
      [`${DIR}/followers_1.json`]: followers1,
      'instagram-me-2026/media/posts/photo.jpg': new Uint8Array([1, 2, 3]),
      '__MACOSX/._following.json': 'junk',
      'instagram-me-2026/start_here.html': '<html></html>',
    });
    const inputs = await readInputs([new File([zip], 'instagram-me-2026.zip')]);
    expect(inputs.map(i => i.path).sort()).toEqual([
      `instagram-me-2026.zip/${DIR}/followers_1.json`,
      `instagram-me-2026.zip/${DIR}/following.json`,
      'instagram-me-2026.zip/instagram-me-2026/start_here.html',
    ]);
    expect(inputs.find(i => i.path.endsWith('following.json'))?.text).toBe(following);
    expect(inputs.find(i => i.path.endsWith('.html'))?.text).toBe('');
  });

  test('from a zip, reads only the follow files and a progress file; other JSON stays packed', async () => {
    const progress = JSON.stringify({ accounts: {} });
    const zip = await zipOf({
      [`${DIR}/following.json`]: following,
      [`${DIR}/followers_1.json`]: followers1,
      [`${DIR}/followers_2.json`]: followers1,
      [`${DIR}/close_friends.json`]: '[]',
      'instagram-me-2026/your_instagram_activity/likes/liked_posts.json': JSON.stringify(Array(10_000).fill({ x: 1 })),
      'instagram-me-2026/your_instagram_activity/messages/inbox/a/message_1.json': '{}',
      'unfollowism_progress_2026-11-06_10-00-00 (1).json': progress,
    });
    const inputs = await readInputs([new File([zip], 'me.zip')]);
    expect(inputs.map(i => i.path).sort()).toEqual([
      `me.zip/${DIR}/followers_1.json`,
      `me.zip/${DIR}/followers_2.json`,
      `me.zip/${DIR}/following.json`,
      'me.zip/unfollowism_progress_2026-11-06_10-00-00 (1).json',
    ]);
    expect(inputs.find(i => i.path.includes('unfollowism_'))?.text).toBe(progress);
  });

  test('reads loose JSON files and ignores unrelated file types', async () => {
    const inputs = await readInputs([
      new File([following], 'following.json'),
      new File(['x'], 'notes.txt'),
      new File([new Uint8Array([0xff])], 'photo.jpg'),
    ]);
    expect(inputs).toEqual([{ path: 'following.json', text: following }]);
  });

  test('decodes UTF-8 usernames and notes correctly', async () => {
    const text = JSON.stringify({ accounts: { ünïcode: { notes: 'кириллица 🎨' } } });
    const [input] = await readInputs([new File([text], 'master.json')]);
    expect(input?.text).toBe(text);
  });
});
