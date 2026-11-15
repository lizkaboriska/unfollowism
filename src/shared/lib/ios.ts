/**
 * navigator.standalone (web.dev's advice for this iOS-only case): true in an iPhone/iPad Home Screen app, false in a
 * browser tab there, and in Mac Safari too; missing everywhere else.
 */
function standalone(): boolean | undefined {
  return (navigator as Navigator & { standalone?: boolean }).standalone;
}

/** An iPhone/iPad Home Screen app. Installed apps elsewhere are left out. */
export function isIosHomeScreenApp(): boolean {
  return standalone() === true;
}

/** Chrome, Firefox, Edge and Opera on iPhone: Safari's engine, so standalone is false there too, but other menus. */
const OTHER_IOS_BROWSERS = /CriOS|FxiOS|EdgiOS|OPiOS/;

/**
 * A Safari tab on an iPhone/iPad, where the work can be cleared after a week unused and Add to Home Screen helps.
 * A touch screen tells it from Mac Safari (iPad Safari names itself a Mac, so the user agent can't).
 */
export function isIosSafariTab(): boolean {
  return standalone() === false && navigator.maxTouchPoints > 1 && !OTHER_IOS_BROWSERS.test(navigator.userAgent);
}
