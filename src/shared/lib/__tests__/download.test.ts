import { saveTextFile } from '../download.ts';

/** Pretends the page is (or isn't) the iPhone Home Screen app, and gives it a share sheet. */
function setUp({
  isInstalled,
  canShare = true,
  share = vi.fn(() => Promise.resolve()),
}: {
  isInstalled: boolean;
  canShare?: boolean;
  share?: (data: ShareData) => Promise<void>;
}) {
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: isInstalled });
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => canShare });
  Object.defineProperty(navigator, 'share', { configurable: true, value: share });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:file');
  return { share, click };
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'standalone');
  Reflect.deleteProperty(navigator, 'canShare');
  Reflect.deleteProperty(navigator, 'share');
});

test('in a browser tab (or an installed app elsewhere) it downloads the file', async () => {
  const { share, click } = setUp({ isInstalled: false });
  await saveTextFile('progress.json', '{}');
  expect(click).toHaveBeenCalledOnce();
  expect(share).not.toHaveBeenCalled();
});

test('in the iPhone Home Screen app it opens the share sheet with the file, and downloads nothing', async () => {
  const { share, click } = setUp({ isInstalled: true });
  await saveTextFile('progress.json', '{"a":1}');
  const [data] = vi.mocked(share).mock.calls[0] ?? [];
  const [file] = data?.files ?? [];
  expect(file?.name).toBe('progress.json');
  expect(await file?.text()).toBe('{"a":1}');
  expect(click).not.toHaveBeenCalled();
});

test('closing the share sheet without saving rejects with its AbortError, and downloads nothing', async () => {
  const closed = new DOMException('Share canceled', 'AbortError');
  const { click } = setUp({ isInstalled: true, share: () => Promise.reject(closed) });
  await expect(saveTextFile('progress.json', '{}')).rejects.toBe(closed);
  expect(click).not.toHaveBeenCalled();
});

test('when the share sheet is not allowed or cannot take the file, it downloads instead', async () => {
  const notAllowed = setUp({
    isInstalled: true,
    share: () => Promise.reject(new DOMException('Not allowed', 'NotAllowedError')),
  });
  await saveTextFile('progress.json', '{}');
  expect(notAllowed.click).toHaveBeenCalledOnce();
  vi.restoreAllMocks();

  const cannotShare = setUp({ isInstalled: true, canShare: false });
  await saveTextFile('progress.json', '{}');
  expect(cannotShare.click).toHaveBeenCalledOnce();
  expect(cannotShare.share).not.toHaveBeenCalled();
});
