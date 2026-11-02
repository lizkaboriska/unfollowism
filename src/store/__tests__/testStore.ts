import { memoryLastSaved, type LastSavedStore } from '@/entities/master/api/lastSaved.ts';
import { createMemoryTabDatabase, type TabStore } from '@/entities/master/api/tabStore.ts';
import { followersFile, followingFile, must } from '@/entities/master/lib/__tests__/helpers.ts';
import { analyzeImport, type PreparedImport } from '@/entities/master/lib/analyzeImport.ts';
import type { ValueOf } from '@/shared/lib/valueOf.ts';
import { memoryAddressBar, type AddressBar } from '@/shared/url/addressBar.ts';

import { makeStore } from '../index.ts';

export interface Download {
  filename: string;
  text: string;
}

export function makeTestStore({
  now = '2026-10-27T12:00:00.000Z',
  tab = createMemoryTabDatabase().forTab('tab-1'),
  lastSaved = memoryLastSaved(),
  address = memoryAddressBar(),
  download,
}: {
  now?: string;
  tab?: TabStore;
  lastSaved?: LastSavedStore;
  address?: AddressBar;
  download?: (filename: string, text: string) => void | Promise<void>;
} = {}) {
  const downloads: Download[] = [];
  let clock = new Date(now);
  const store = makeStore({
    now: () => clock,
    download:
      download ??
      ((filename, text) => {
        downloads.push({ filename, text });
      }),
    tab,
    lastSaved,
    address,
  });
  return {
    store,
    downloads,
    tab,
    lastSaved,
    setNow: (iso: string) => {
      clock = new Date(iso);
    },
  };
}

export const WRITES = { REPLACE: 'replace', UPDATE: 'update' } as const;

export interface RecordedWrite {
  kind: ValueOf<typeof WRITES>;
  accounts: string[];
  saved: string[];
  removed: string[];
}

/** Wraps a tab store and records every write (account keys only), to assert what gets written when. */
export function recordingTab(inner: TabStore = createMemoryTabDatabase().forTab('tab-1')) {
  const writes: RecordedWrite[] = [];
  const tab: TabStore = {
    durable: inner.durable,
    load: () => inner.load(),
    replace: (base, meta, w) => {
      writes.push({ kind: WRITES.REPLACE, accounts: Object.keys(w.changed), saved: Object.keys(w.saved), removed: [] });
      return inner.replace(base, meta, w);
    },
    update: (meta, w) => {
      writes.push({
        kind: WRITES.UPDATE,
        accounts: Object.keys(w.changed),
        saved: Object.keys(w.saved),
        removed: w.removed,
      });
      return inner.update(meta, w);
    },
  };
  return { tab, writes };
}

/** Lets the persistence listener finish its (async) storage writes. */
export const flushPersistence = () => new Promise(resolve => setTimeout(resolve, 0));

export function prepared({
  following = [['Alice'], ['bob'], ['carol']],
  followers = [['alice'], ['dave']],
  master = null,
  lastKnownSavedAt = null,
}: {
  following?: [string, number?][];
  followers?: [string, number?][];
  master?: unknown;
  lastKnownSavedAt?: string | null;
} = {}): PreparedImport {
  const inputs = [
    {
      path: 'export/connections/followers_and_following/following.json',
      text: JSON.stringify(followingFile(...following)),
    },
    {
      path: 'export/connections/followers_and_following/followers_1.json',
      text: JSON.stringify(followersFile(...followers)),
    },
  ];
  if (master) {
    inputs.push({ path: 'unfollowism_master.json', text: JSON.stringify(master) });
  }
  return must(analyzeImport(inputs, lastKnownSavedAt).prepared);
}

export function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(r => {
    resolve = r;
  });
  return { promise, resolve };
}
