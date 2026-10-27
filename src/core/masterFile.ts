import { createActions } from "./actions.ts";
import { createReview } from "./review.ts";
import { computeCurrent } from "./scopes.ts";
import {
  ACTION_TYPES,
  FOLLOWER_CHANGES,
  FORMAT_VERSION,
  type Account,
  type AccountActions,
  type ActionType,
  type DeepReadonly,
  type Master,
  type FollowerChange,
  type Review,
} from "./types.ts";
import { createDict, isRecord, usernameKey } from "./util.ts";

/**
 * The saved form of the master (download file and browser storage). Compact: anything
 * that can be recomputed is left out, and default values are omitted.
 */
export interface MasterFile {
  version: typeof FORMAT_VERSION;
  last_saved_at?: string;
  last_import_at: string;
  tag_options: string[];
  /** Keyed by lower-cased username. */
  accounts: Record<string, AccountRecord>;
}

export interface AccountRecord {
  username: string;
  /** Present when you follow them; null when the export gave no time. */
  following_since?: number | null;
  /** Present when they follow you; null when the export gave no time. */
  follower_since?: number | null;
  /** Omitted while it is the default (never reviewed, no tags, no notes). */
  review?: Review;
  /** Omitted while both lists are empty. */
  actions?: AccountActions;
  /** Set by the latest import when they started or stopped following you. */
  follower_change?: FollowerChange;
}

export class MasterFormatError extends Error {
  override name = "MasterFormatError";
}

// ── Writing ──────────────────────────────────────────────────────────────────

function isDefaultReview(r: DeepReadonly<Review>): boolean {
  return !r.reviewed && r.last_reviewed_at === null && !r.deleted_or_unavailable && r.tags.length === 0 && r.notes === "";
}

export function toAccountRecord(account: DeepReadonly<Account>): AccountRecord {
  const { current, review, actions } = account;
  const out: AccountRecord = { username: account.username };
  if (current.you_follow) out.following_since = current.following_since_timestamp;
  if (current.follows_you) out.follower_since = current.follower_since_timestamp;
  if (!isDefaultReview(review)) out.review = { ...review, tags: [...review.tags] };
  if (actions.pending.length || actions.confirmed.length) out.actions = { pending: [...actions.pending], confirmed: [...actions.confirmed] };
  if (account.follower_change) out.follower_change = account.follower_change;
  return out;
}

export function toMasterFile(master: DeepReadonly<Master>): MasterFile {
  const accounts: Record<string, AccountRecord> = {};
  for (const [key, account] of Object.entries(master.accounts)) accounts[key] = toAccountRecord(account);
  return {
    version: FORMAT_VERSION,
    ...(master.last_saved_at === undefined ? {} : { last_saved_at: master.last_saved_at }),
    last_import_at: master.last_import_at,
    tag_options: [...master.tag_options],
    accounts,
  };
}

/**
 * JSON text for the download: small fields indented, one account per line, so the
 * file stays readable without the size of fully indented JSON.
 */
export function stringifyMasterFile(file: MasterFile): string {
  const { accounts, ...head } = file;
  const headLines = Object.entries(head).map(([key, value]) => `  ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  const accountLines = Object.entries(accounts).map(([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`);
  return `{\n${headLines.join(",\n")},\n  "accounts": {\n${accountLines.join(",\n")}\n  }\n}\n`;
}

// ── Reading: strict, each reader names the offending field ──────────────────

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

function numOrNull(value: unknown, path: string): number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value)) ? value : fail(path, "a number or null");
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

/** Builds the working account from its saved record. */
export function fromAccountRecord(value: unknown, path: string): Account {
  const r = record(value, path);
  const account: Account = {
    username: nonEmptyStr(r.username, `${path}.username`),
    review: r.review === undefined ? createReview() : parseReview(r.review, `${path}.review`),
    current: computeCurrent(
      "following_since" in r ? { timestamp: numOrNull(r.following_since, `${path}.following_since`) } : null,
      "follower_since" in r ? { timestamp: numOrNull(r.follower_since, `${path}.follower_since`) } : null,
    ),
    actions: r.actions === undefined ? createActions() : parseActions(r.actions, `${path}.actions`),
  };
  if (r.follower_change !== undefined) account.follower_change = oneOf(r.follower_change, Object.values(FOLLOWER_CHANGES), `${path}.follower_change`);
  return account;
}

/**
 * The single entry point for a master coming from outside (file import, browser
 * storage). Accepts only the current format and returns a fresh working master;
 * unknown fields are dropped. Never mutates `raw`.
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
    const account = fromAccountRecord(value, `accounts.${rawKey}`);
    const key = usernameKey(account.username);
    if (Object.hasOwn(accounts, key)) throw new MasterFormatError(`Invalid master file: account "${account.username}" appears twice.`);
    accounts[key] = account;
  }

  const master: Master = {
    version: FORMAT_VERSION,
    tag_options: strings(raw.tag_options, "tag_options"),
    accounts,
    last_import_at: nonEmptyStr(raw.last_import_at, "last_import_at"),
  };
  if (raw.last_saved_at !== undefined) master.last_saved_at = str(raw.last_saved_at, "last_saved_at");
  return master;
}
