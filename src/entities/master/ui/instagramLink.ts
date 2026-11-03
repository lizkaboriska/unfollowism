import type { MouseEvent } from 'react';

const POPUP_NAME = 'unfollowism-profile';

/** A phone-sized window at the right edge of the screen, so the list stays visible next to it. */
function popupFeatures(screen: Screen): string {
  const width = Math.min(520, Math.max(360, screen.availWidth));
  const height = Math.min(900, Math.max(640, screen.availHeight));
  const left = Math.max(0, screen.availWidth - width - 16);
  return `popup=yes,width=${width},height=${height},left=${left},top=16,resizable=yes,scrollbars=yes`;
}

/**
 * Click handler for a profile link: a plain click opens (or reuses) the side popup.
 * Cmd/Ctrl/Shift/Alt/middle clicks are left to the browser (new tab or window), and so is
 * a plain click when popups are blocked, since the link itself has target="_blank".
 */
export function openProfilePopup(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
    return;
  }
  const popup = window.open(event.currentTarget.href, POPUP_NAME, popupFeatures(window.screen));
  if (!popup) {
    return;
  }
  event.preventDefault();
  try {
    popup.focus();
  } catch {
    // Cross-origin windows may refuse focus(); the popup is still usable.
  }
}
