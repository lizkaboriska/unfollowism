import { followersFile, followingFile } from "../../core/__tests__/helpers.ts";
import { analyzeImport, type PreparedImport } from "../../io/analyzeImport.ts";
import { createMemorySessionStore, type SessionStore } from "../../io/sessionStore.ts";
import { makeStore } from "../index.ts";

export interface Download {
  filename: string;
  text: string;
}

export function makeTestStore({ now = "2026-10-27T12:00:00.000Z", sessionStore = createMemorySessionStore(), download }: {
  now?: string;
  sessionStore?: SessionStore;
  download?: (filename: string, text: string) => void | Promise<void>;
} = {}) {
  const downloads: Download[] = [];
  let clock = new Date(now);
  const store = makeStore(
    {
      now: () => clock,
      download: download ?? ((filename, text) => { downloads.push({ filename, text }); }),
      sessionStore,
    },
    { persistDebounceMs: 5 },
  );
  return {
    store,
    downloads,
    sessionStore,
    setNow: (iso: string) => { clock = new Date(iso); },
  };
}

/** Waits for the debounced persistence listener. */
export const flushPersistence = () => new Promise(resolve => setTimeout(resolve, 30));

export function prepared({
  following = [["Alice"], ["bob"], ["carol"]],
  followers = [["alice"], ["dave"]],
  master = null,
  lastKnownSavedAt = null,
}: {
  following?: [string, number?][];
  followers?: [string, number?][];
  master?: unknown;
  lastKnownSavedAt?: string | null;
} = {}): PreparedImport {
  const inputs = [
    { path: "export/connections/followers_and_following/following.json", text: JSON.stringify(followingFile(...following)) },
    { path: "export/connections/followers_and_following/followers_1.json", text: JSON.stringify(followersFile(...followers)) },
  ];
  if (master) inputs.push({ path: "instagram_master_tracker.json", text: JSON.stringify(master) });
  return analyzeImport(inputs, lastKnownSavedAt);
}

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => { resolve = r; });
  return { promise, resolve };
}
