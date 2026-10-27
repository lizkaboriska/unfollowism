import { ImportError, isRecord, parseFollowersJson, parseFollowingJson, type ExportBundle } from "../core/index.ts";
import type { InputText } from "./readInputs.ts";

export const IMPORT_WARNINGS = {
  MASTER_OLDER_THAN_LAST_SAVE: "masterOlderThanLastSave",
  NO_MASTER_BUT_SAVED_BEFORE: "noMasterButSavedBefore",
} as const;

export type ImportWarning =
  /** The chosen master was saved before the last save made in this browser. */
  | { kind: typeof IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE; fileSavedAt: string | null; lastKnownSavedAt: string }
  /** No master chosen, but this browser has saved one before: review history would start over. */
  | { kind: typeof IMPORT_WARNINGS.NO_MASTER_BUT_SAVED_BEFORE; lastKnownSavedAt: string };

/** Everything needed to run importExport(), produced before anything touches the store. */
export interface PreparedImport {
  rawMaster: unknown;
  masterPath: string | null;
  bundle: ExportBundle;
  warnings: ImportWarning[];
  ignoredCount: number;
}

/** What the selection contains, for the import screen; shown even when something is missing. */
export interface RecognizedFiles {
  hasFollowing: boolean;
  followerFileCount: number;
  /** The chosen master; null when none was chosen (a new one will be started). */
  master: { name: string; savedAt: string | null } | null;
}

export interface ImportSelection {
  recognized: RecognizedFiles;
  /** Null until both the Following and the Followers files are in the selection. */
  prepared: PreparedImport | null;
}

const FOLLOWERS_NAME = /(^|\/)followers_(\d+)\.json$/i;

function baseName(path: string): string {
  return path.split("/").at(-1) ?? path;
}

function followerChunkNumber(path: string): number {
  return Number(FOLLOWERS_NAME.exec(path)?.[2] ?? Number.MAX_SAFE_INTEGER);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * Classifies the files by content (and, for follower chunks, by Instagram's file name):
 * - object with `relationships_following` → Following
 * - array named `followers_N.json` → a Followers chunk
 * - object with an `accounts` object → a master
 * Everything else in a full Instagram export (likes, messages, …) is ignored.
 * A missing Following or Followers file is not an error: the import screen shows what's missing.
 * Selections that can't be imported as they are (HTML export, duplicates) throw ImportError.
 */
export function analyzeImport(inputs: readonly InputText[], lastKnownSavedAt: string | null): ImportSelection {
  let following: { path: string; data: unknown } | null = null;
  const followers: { path: string; data: unknown }[] = [];
  const masters: { path: string; data: Record<string, unknown> }[] = [];
  let htmlCount = 0;
  let ignoredCount = 0;

  for (const input of inputs) {
    if (/\.html?$/i.test(input.path)) {
      if (/following|followers_\d+/i.test(baseName(input.path))) htmlCount += 1;
      else ignoredCount += 1;
      continue;
    }
    const data = parseJson(input.text);

    if (isRecord(data) && Array.isArray(data.relationships_following)) {
      if (following) throw new ImportError(`Found more than one Following file (${following.path} and ${input.path}). Choose files from a single Instagram export.`);
      following = { path: input.path, data };
    } else if (Array.isArray(data) && FOLLOWERS_NAME.test(input.path)) {
      followers.push({ path: input.path, data });
    } else if (isRecord(data) && isRecord(data.accounts)) {
      masters.push({ path: input.path, data });
    } else {
      ignoredCount += 1;
    }
  }

  const seenChunks = new Set<string>();
  for (const { path } of followers) {
    const name = baseName(path).toLowerCase();
    if (seenChunks.has(name)) throw new ImportError(`Found ${name} twice. Choose files from a single Instagram export.`);
    seenChunks.add(name);
  }
  if (masters.length > 1) {
    throw new ImportError(`Found ${masters.length} master files (${masters.map(m => baseName(m.path)).join(", ")}). Choose only the newest one.`);
  }

  if ((!following || !followers.length) && htmlCount) {
    throw new ImportError("This export is in HTML format. In Instagram, request “Download your information” again and choose the JSON format.");
  }

  const master = masters[0] ?? null;
  const masterSavedAt = typeof master?.data.lastSavedAt === "string" ? master.data.lastSavedAt : null;
  const recognized: RecognizedFiles = {
    hasFollowing: following !== null,
    followerFileCount: followers.length,
    master: master && { name: baseName(master.path), savedAt: masterSavedAt },
  };
  if (!following || !followers.length) return { recognized, prepared: null };

  followers.sort((a, b) => followerChunkNumber(a.path) - followerChunkNumber(b.path));

  const warnings: ImportWarning[] = [];
  if (lastKnownSavedAt) {
    if (!master) {
      warnings.push({ kind: IMPORT_WARNINGS.NO_MASTER_BUT_SAVED_BEFORE, lastKnownSavedAt });
    } else if (!masterSavedAt || Date.parse(masterSavedAt) < Date.parse(lastKnownSavedAt)) {
      warnings.push({ kind: IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE, fileSavedAt: masterSavedAt, lastKnownSavedAt });
    }
  }

  const prepared: PreparedImport = {
    rawMaster: master?.data ?? null,
    masterPath: master?.path ?? null,
    bundle: {
      following: parseFollowingJson(following.data),
      followers: followers.flatMap(f => parseFollowersJson(f.data)),
      followerFileCount: followers.length,
    },
    warnings,
    ignoredCount,
  };
  return { recognized, prepared };
}
