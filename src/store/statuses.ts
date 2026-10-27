import type { ValueOf } from "../core/index.ts";

export const IMPORT_STATUSES = { IDLE: "idle", IMPORTING: "importing" } as const;
export type ImportStatus = ValueOf<typeof IMPORT_STATUSES>;

export const SAVE_STATUSES = { IDLE: "idle", SAVING: "saving" } as const;
export type SaveStatus = ValueOf<typeof SAVE_STATUSES>;
