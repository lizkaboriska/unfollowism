/**
 * Resolves after the browser has had a chance to draw, so a "working…" state set just
 * before heavy synchronous work is actually visible. Falls back to a plain timeout where
 * there is no animation frame (tests, Node).
 */
export function nextPaint(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestAnimationFrame === 'function')
      requestAnimationFrame(() => {
        setTimeout(resolve, 0);
      });
    else setTimeout(resolve, 0);
  });
}
