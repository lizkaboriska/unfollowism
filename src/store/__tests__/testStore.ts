import { followersFile, followingFile } from "../../core/__tests__/helpers.ts";
import { analyzeImport, type PreparedImport } from "../../io/analyzeImport.ts";
import { memoryLastSaved, type LastSavedStore } from "../../io/lastSaved.ts";
import { createMemoryTabDatabase, type TabStore } from "../../io/tabStore.ts";
import { makeStore } from "../index.ts";

export interface Download {
  filename: string;
  text: string;
}

export function makeTestStore({
  now = "2026-10-27T12:00:00.000Z",
  tab = createMemoryTabDatabase().forTab("tab-1"),
  lastSaved = memoryLastSaved(),
  download,
}: {
  now?: string;
  tab?: TabStore;
  lastSaved?: LastSavedStore;
  download?: (filename: string, text: string) => void | Promise<void>;
} = {}) {
  const downloads: Download[] = [];
  let clock = new Date(now);
  const store = makeStore({
    now: () => clock,
    download: download ?? ((filename, text) => { downloads.push({ filename, text }); }),
    tab,
    lastSaved,
  });
  return {
    store,
    downloads,
    tab,
    lastSaved,
    setNow: (iso: string) => { clock = new Date(iso); },
  };
}

/** Wraps a tab store and records every write, to assert what gets written when. */
export function recordingTab(inner: TabStore = createMemoryTabDatabase().forTab("tab-1")) {
  const writes: { kind: "replace" | "update"; accounts: string[] }[] = [];
  const tab: TabStore = {
    durable: inner.durable,
    load: () => inner.load(),
    replace: (base, meta, changed) => { writes.push({ kind: "replace", accounts: Object.keys(changed) }); return inner.replace(base, meta, changed); },
    update: (meta, changed) => { writes.push({ kind: "update", accounts: Object.keys(changed) }); return inner.update(meta, changed); },
  };
  return { tab, writes };
}

/** Lets the persistence listener finish its (async) storage writes. */
export const flushPersistence = () => new Promise(resolve => setTimeout(resolve, 0));

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
