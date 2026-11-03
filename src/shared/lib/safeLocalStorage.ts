/** The browser's localStorage, or null where even reaching it throws (blocked by privacy settings). */
export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
