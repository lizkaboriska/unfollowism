import type { MasterFile } from '../../lib/masterFile.ts';
import type { TabMeta, TabWrites } from '../tabStore.ts';

export const META: TabMeta = {
  revision: 2,
  savedRevision: 0,
  storedAt: '2026-10-27T12:00:00Z',
  importFacts: { followingBefore: 0, followersBefore: 0, completedPlans: {} },
};
export const NOTHING: TabWrites = { changed: {}, saved: {} };
export const edited = (changed: TabWrites['changed']) => ({ changed, removed: [], saved: {} });
export const BASE: MasterFile = {
  version: 1,
  lastImportAt: '2026-10-27T12:00:00Z',
  accounts: JSON.parse('{"bob":{"username":"bob"},"constructor":{"username":"constructor"}}') as MasterFile['accounts'],
};
