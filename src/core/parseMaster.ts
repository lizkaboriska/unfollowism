import {
  ACTION_STATUSES,
  ACTION_TYPES,
  DEFAULT_TAG_OPTIONS,
  FORMAT_VERSION,
  type Account,
  type Action,
  type CurrentRelationship,
  type Master,
  type Relationship,
  type Review,
  type Snapshot,
  type SnapshotChanges,
  type SnapshotCounts,
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

function timestamps(value: unknown, path: string): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [name, ts] of Object.entries(record(value, path))) out[name] = numOrNull(ts, `${path}.${name}`);
  return out;
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

function parseAccount(value: unknown, path: string): Account {
  const a = record(value, path);
  return {
    username: nonEmptyStr(a.username, `${path}.username`),
    url: str(a.url, `${path}.url`),
    review: parseReview(a.review, `${path}.review`),
    current: parseCurrent(a.current, `${path}.current`),
  };
}

function parseCounts(value: unknown, path: string): SnapshotCounts {
  const c = record(value, path);
  return {
    following: num(c.following, `${path}.following`),
    followers: num(c.followers, `${path}.followers`),
    mutual: num(c.mutual, `${path}.mutual`),
    not_following_back: num(c.not_following_back, `${path}.not_following_back`),
    followers_you_do_not_follow: num(c.followers_you_do_not_follow, `${path}.followers_you_do_not_follow`),
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
    snapshot_id: nonEmptyStr(s.snapshot_id, `${path}.snapshot_id`),
    snapshot_date: nonEmptyStr(s.snapshot_date, `${path}.snapshot_date`),
    captured_at: strOrNull(s.captured_at, `${path}.captured_at`),
    source_files: strings(s.source_files, `${path}.source_files`),
    following: timestamps(s.following, `${path}.following`),
    followers: timestamps(s.followers, `${path}.followers`),
    counts: parseCounts(s.counts, `${path}.counts`),
  };
  if (s.changes_from_previous_snapshot !== undefined) {
    snapshot.changes_from_previous_snapshot = parseChanges(s.changes_from_previous_snapshot, `${path}.changes_from_previous_snapshot`);
  }
  return snapshot;
}

function parseAction(value: unknown, path: string): Action {
  const a = record(value, path);
  const rel = a.relationship_at_mark;
  return {
    action_id: nonEmptyStr(a.action_id, `${path}.action_id`),
    username: nonEmptyStr(a.username, `${path}.username`),
    type: oneOf(a.type, ACTION_TYPES, `${path}.type`),
    status: oneOf(a.status, ACTION_STATUSES, `${path}.status`),
    marked_at: strOrNull(a.marked_at, `${path}.marked_at`),
    confirmed_at: strOrNull(a.confirmed_at, `${path}.confirmed_at`),
    cancelled_at: strOrNull(a.cancelled_at, `${path}.cancelled_at`),
    confirmation_snapshot_id: strOrNull(a.confirmation_snapshot_id, `${path}.confirmation_snapshot_id`),
    confirmation_snapshot_date: strOrNull(a.confirmation_snapshot_date, `${path}.confirmation_snapshot_date`),
    relationship_at_mark: rel === null ? null : {
      you_follow: bool(record(rel, `${path}.relationship_at_mark`).you_follow, `${path}.relationship_at_mark.you_follow`),
      follows_you: bool(record(rel, `${path}.relationship_at_mark`).follows_you, `${path}.relationship_at_mark.follows_you`),
    },
  };
}

export function emptyMaster(): Master {
  return { version: FORMAT_VERSION, tag_options: [...DEFAULT_TAG_OPTIONS], accounts: createDict<Account>(), snapshots: [], actions: [] };
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
    actions: array(raw.actions, "actions").map((a, i) => parseAction(a, `actions[${i}]`)),
  };
  if (raw.last_saved_at !== undefined) master.last_saved_at = str(raw.last_saved_at, "last_saved_at");
  return master;
}
