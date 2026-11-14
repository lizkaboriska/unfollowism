import type { BackupMeta, MasterFile } from '../../lib/masterFile.ts';
import type { BackupWrites } from '../backupStore.ts';

export const META: BackupMeta = {
  revision: 2,
  savedRevision: 0,
  importFacts: { followingBefore: 0, followersBefore: 0, completedPlans: {}, previousImportAt: null },
};
export const NOTHING: BackupWrites = { changed: {}, saved: {} };
export const edited = (changed: BackupWrites['changed']) => ({ changed, removed: [], saved: {} });
export const BASE: MasterFile = {
  version: 1,
  lastImportAt: '2026-10-27T12:00:00Z',
  accounts: JSON.parse('{"bob":{"username":"bob"},"constructor":{"username":"constructor"}}') as MasterFile['accounts'],
};
