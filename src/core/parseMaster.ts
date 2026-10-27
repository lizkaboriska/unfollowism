import {
  ACTION_TYPES,
  DEFAULT_TAG_OPTIONS,
  FORMAT_VERSION,
  type Account,
  type AccountActions,
  type ActionType,
  type CurrentRelationship,
  type Master,
  type Relationship,
  type Review,
  type Snapshot,
  type SnapshotChanges,
} from "./types.ts";
import { createDict, isRecord, usernameKey } from "./util.ts";

export class MasterFormatError extends Error {
  override name = "MasterFormatError";
}

const RELATIONSHIPS: readonly Relationship[] = ["mutual", "not_following_back", "follows_you_only", "neither"];

/** Small strict readers: each throws MasterFormatError naming the offending field. */
function fail(path: string, expected: string): never {
  throw new MasterFormatError(`Invalid master file: ${path} should be ${expected}.`);
}

function record(value: unknown, path: string): Record<string, unknown> {
  return isRecord(value) ? value : fail(path, "an object");
}

function array(value: unknown, path: string): unknown[] {
  return Array.isArray(value) ? value : fail(path, "a list");
}

function str(value: unknown, path: string): string {
  return typeof value === "string" ? value : fail(path, "text");
}

function nonEmptyStr(value: unknown, path: string): string {
  return typeof value === "string" && value ? value : fail(path, "non-empty text");
}

function strOrNull(value: unknown, path: string): string | null {
  return value === null || typeof value === "string" ? value : fail(path, "text or null");
}

function bool(value: unknown, path: string): boolean {
  return typeof value === "boolean" ? value : fail(path, "true or false");
}

function num(value: unknown, path: string): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fail(path, "a number");
}

function numOrNull(value: unknown, path: string): number | null {
  return value === null ? null : num(value, path);
}

function oneOf<T extends string>(value: unknown, options: readonly T[], path: string): T {
  return (options as readonly unknown[]).includes(value) ? (value as T) : fail(path, `one of ${options.join(", ")}`);
}

function strings(value: unknown, path: string): string[] {
  return array(value, path).map((item, i) => str(item, `${path}[${i}]`));
}

function parseReview(value: unknown, path: string): Review {
  const r = record(value, path);
  return {
    reviewed: bool(r.reviewed, `${path}.reviewed`),
    last_reviewed_at: strOrNull(r.last_reviewed_at, `${path}.last_reviewed_at`),
    deleted_or_unavailable: bool(r.deleted_or_unavailable, `${path}.deleted_or_unavailable`),
    tags: strings(r.tags, `${path}.tags`),
    notes: str(r.notes, `${path}.notes`),
  };
}

function parseCurrent(value: unknown, path: string): CurrentRelationship {
  const c = record(value, path);
  return {
    you_follow: bool(c.you_follow, `${path}.you_follow`),
    follows_you: bool(c.follows_you, `${path}.follows_you`),
    relationship: oneOf(c.relationship, RELATIONSHIPS, `${path}.relationship`),
    following_since_timestamp: numOrNull(c.following_since_timestamp, `${path}.following_since_timestamp`),
    follower_since_timestamp: numOrNull(c.follower_since_timestamp, `${path}.follower_since_timestamp`),
  };
}

function actionTypes(value: unknown, path: string): ActionType[] {
  const types = array(value, path).map((item, i) => oneOf(item, ACTION_TYPES, `${path}[${i}]`));
  return new Set(types).size === types.length ? types : fail(path, "a list without duplicates");
}

function parseActions(value: unknown, path: string): AccountActions {
  const a = record(value, path);
  return {
    pending: actionTypes(a.pending, `${path}.pending`),
    confirmed: actionTypes(a.confirmed, `${path}.confirmed`),
  };
}

function parseAccount(value: unknown, path: string): Account {
  const a = record(value, path);
  return {
    username: nonEmptyStr(a.username, `${path}.username`),
    url: str(a.url, `${path}.url`),
    review: parseReview(a.review, `${path}.review`),
    current: parseCurrent(a.current, `${path}.current`),
    actions: parseActions(a.actions, `${path}.actions`),
  };
}

function parseChanges(value: unknown, path: string): SnapshotChanges {
  const c = record(value, path);
  return {
    newly_following: strings(c.newly_following, `${path}.newly_following`),
    stopped_following: strings(c.stopped_following, `${path}.stopped_following`),
    new_followers: strings(c.new_followers, `${path}.new_followers`),
    lost_followers: strings(c.lost_followers, `${path}.lost_followers`),
  };
}

function parseSnapshot(value: unknown, path: string): Snapshot {
  const s = record(value, path);
  const snapshot: Snapshot = {
    captured_at: nonEmptyStr(s.captured_at, `${path}.captured_at`),
    following: strings(s.following, `${path}.following`),
    followers: strings(s.followers, `${path}.followers`),
  };
  if (s.changes !== undefined) snapshot.changes = parseChanges(s.changes, `${path}.changes`);
  return snapshot;
}

export function emptyMaster(): Master {
  return { version: FORMAT_VERSION, tag_options: [...DEFAULT_TAG_OPTIONS], accounts: createDict<Account>(), snapshots: [] };
}

/**
 * The single entry point for a master coming from outside (file import, browser
 * storage). Accepts only the current format and returns a fresh object holding
 * just the known fields; anything else in the file is dropped. Never mutates `raw`.
 */
export function parseMaster(raw: unknown): Master {
  if (!isRecord(raw) || !isRecord(raw.accounts)) {
    throw new MasterFormatError("This file is not an Instagram Review master.");
  }
  if (raw.version !== FORMAT_VERSION) {
    throw new MasterFormatError("This file wasn't saved by a compatible version of Instagram Review.");
  }

  const accounts = createDict<Account>();
  for (const [rawKey, value] of Object.entries(raw.accounts)) {
    const account = parseAccount(value, `accounts.${rawKey}`);
    const key = usernameKey(account.username);
    if (Object.hasOwn(accounts, key)) throw new MasterFormatError(`Invalid master file: account "${account.username}" appears twice.`);
    accounts[key] = account;
  }

  const master: Master = {
    version: FORMAT_VERSION,
    tag_options: strings(raw.tag_options, "tag_options"),
    accounts,
    snapshots: array(raw.snapshots, "snapshots").map((s, i) => parseSnapshot(s, `snapshots[${i}]`)),
  };
  if (raw.last_saved_at !== undefined) master.last_saved_at = str(raw.last_saved_at, "last_saved_at");
  return master;
}
