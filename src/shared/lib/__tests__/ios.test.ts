import { isIosHomeScreenApp, isIosSafariTab } from '../ios.ts';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 ' +
  'Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/142.0 ' +
  'Mobile/15E148 Safari/604.1';
/** iPad Safari and Mac Safari send the same: only touch tells them apart. */
const MAC_SAFARI =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.1 ' +
  'Safari/605.1.15';

function pretend({
  standalone,
  touchPoints,
  userAgent,
}: {
  standalone: boolean | undefined;
  touchPoints: number;
  userAgent: string;
}) {
  if (standalone !== undefined) {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: standalone });
  }
  Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: touchPoints });
  Object.defineProperty(navigator, 'userAgent', { configurable: true, value: userAgent });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'standalone');
  Reflect.deleteProperty(navigator, 'maxTouchPoints');
  Reflect.deleteProperty(navigator, 'userAgent');
});

test.each([
  { where: 'a Safari tab on iPhone', standalone: false, touchPoints: 5, userAgent: IPHONE_SAFARI, isTab: true },
  { where: 'a Safari tab on iPad', standalone: false, touchPoints: 5, userAgent: MAC_SAFARI, isTab: true },
  { where: 'the Home Screen app', standalone: true, touchPoints: 5, userAgent: IPHONE_SAFARI, isApp: true },
  { where: 'Safari on a Mac', standalone: false, touchPoints: 0, userAgent: MAC_SAFARI },
  { where: 'Chrome on iPhone', standalone: false, touchPoints: 5, userAgent: IPHONE_CHROME },
  { where: 'any other browser', standalone: undefined, touchPoints: 0, userAgent: 'Mozilla/5.0 (Windows NT 10.0)' },
])('$where', ({ standalone, touchPoints, userAgent, isTab = false, isApp = false }) => {
  pretend({ standalone, touchPoints, userAgent });
  expect(isIosSafariTab()).toBe(isTab);
  expect(isIosHomeScreenApp()).toBe(isApp);
});
