import type { ValueOf } from '@/shared/lib/valueOf.ts';

import type { ImportSummary } from '../core/index.ts';

export const IMPORT_STATUSES = { IDLE: 'idle', IMPORTING: 'importing' } as const;
export type ImportStatus = ValueOf<typeof IMPORT_STATUSES>;

export const SAVE_STATUSES = { IDLE: 'idle', SAVING: 'saving' } as const;
export type SaveStatus = ValueOf<typeof SAVE_STATUSES>;

/** What last happened, for the status bar. Kept structured; the UI decides the wording. */
export const STATUS_EVENTS = { IMPORTED: 'imported', SAVED: 'saved', SAVE_FAILED: 'saveFailed' } as const;

export type StatusEvent =
  | { type: typeof STATUS_EVENTS.IMPORTED; isNewMaster: boolean; followerFileCount: number; summary: ImportSummary }
  | { type: typeof STATUS_EVENTS.SAVED }
  /** `reason` is the error's own message; null when it gave none. */
  | { type: typeof STATUS_EVENTS.SAVE_FAILED; reason: string | null };
