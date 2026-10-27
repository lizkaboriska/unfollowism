/**
 * The last_saved_at of the newest master downloaded from this browser, kept across days
 * and tabs (localStorage) for the "this master is older than your last save" warning.
 */
export interface LastSavedStore {
  get(): string | null;
  set(value: string): void;
}

const KEY = "instagram-review:last-saved-at";

export function localStorageLastSaved(storage: Pick<Storage, "getItem" | "setItem"> | null = safeLocalStorage()): LastSavedStore {
  return {
    get() {
      try {
        return storage?.getItem(KEY) ?? null;
      } catch {
        return null;
      }
    },
    set(value) {
      try {
        storage?.setItem(KEY, value);
      } catch {
        // Storage blocked or full: only the older-master warning is lost.
      }
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function memoryLastSaved(initial: string | null = null): LastSavedStore {
  let value = initial;
  return { get: () => value, set: v => { value = v; } };
}
