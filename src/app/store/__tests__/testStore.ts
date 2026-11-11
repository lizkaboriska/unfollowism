import { createMemoryBackupStore, type BackupStore } from '@/entities/master';
import { memoryLastSaved, type LastSavedStore } from '@/entities/master/api/lastSaved.ts';
import { followersFile, followingFile, must } from '@/entities/master/lib/__tests__/helpers.ts';
import { analyzeImport, type PreparedImport } from '@/entities/master/lib/analyzeImport.ts';
import { nextPaint } from '@/shared/lib/nextPaint.ts';
import type { ValueOf } from '@/shared/lib/valueOf.ts';
import { memoryAddressBar, type AddressBar } from '@/shared/url/addressBar.ts';

import { makeStore } from '../store.ts';

export interface Download {
  filename: string;
  text: string;
}

export function makeTestStore({
  now = '2026-10-27T12:00:00.000Z',
  backup = createMemoryBackupStore(),
  lastSaved = memoryLastSaved(),
  address = memoryAddressBar(),
  download,
}: {
  now?: string;
  backup?: BackupStore;
  lastSaved?: LastSavedStore;
  address?: AddressBar;
  download?: (filename: string, text: string) => void | Promise<void>;
} = {}) {
  const downloads: Download[] = [];
  let clock = new Date(now);
  const store = makeStore({
    now: () => clock,
    nextPaint,
    download:
      download ??
      ((filename, text) => {
        downloads.push({ filename, text });
      }),
    backup,
    lastSaved,
    address,
  });
  return {
    store,
    downloads,
    backup,
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

/** Wraps a backup store and records every write (account keys only), to assert what gets written when. */
export function recordingBackup(inner: BackupStore = createMemoryBackupStore()) {
  const writes: RecordedWrite[] = [];
  const backup: BackupStore = {
    durable: inner.durable,
    load: () => inner.load(),
    replace: (base, meta, backupWrites) => {
      writes.push({
        kind: WRITES.REPLACE,
        accounts: Object.keys(backupWrites.changed),
        saved: Object.keys(backupWrites.saved),
        removed: [],
      });
      return inner.replace(base, meta, backupWrites);
    },
    update: (meta, backupWrites) => {
      writes.push({
        kind: WRITES.UPDATE,
        accounts: Object.keys(backupWrites.changed),
        saved: Object.keys(backupWrites.saved),
        removed: backupWrites.removed,
      });
      return inner.update(meta, backupWrites);
    },
  };
  return { backup, writes };
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
  const promise = new Promise<void>(resolvePromise => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}
