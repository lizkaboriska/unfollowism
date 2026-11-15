import type { MouseEvent } from 'react';

import { openProfilePopup } from '../instagramLink.ts';

/** A plain click on a profile link; `defaultPrevented` tells whether the link was left to the browser. */
function clickProfileLink() {
  const anchor = document.createElement('a');
  anchor.href = 'https://www.instagram.com/alice';
  const event = new window.MouseEvent('click', { button: 0, cancelable: true });
  Object.defineProperty(event, 'currentTarget', { value: anchor });
  openProfilePopup(event as unknown as MouseEvent<HTMLAnchorElement>);
  return event;
}

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(navigator, 'standalone');
});

test('a plain click opens the profile in the side window', () => {
  const open = vi.spyOn(window, 'open').mockReturnValue({ focus: () => undefined } as Window);
  expect(clickProfileLink().defaultPrevented).toBe(true);
  expect(open).toHaveBeenCalledWith('https://www.instagram.com/alice', 'unfollowism-profile', expect.any(String));
});

test('in the iPhone Home Screen app the link opens Instagram itself: no window left behind as a blank page', () => {
  Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
  const open = vi.spyOn(window, 'open');
  expect(clickProfileLink().defaultPrevented).toBe(false);
  expect(open).not.toHaveBeenCalled();
});
