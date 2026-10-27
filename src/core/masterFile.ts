import { createReview } from "./review.ts";
import {
  FORMAT_VERSION,
  PLAN_STATES,
  type Account,
  type DeepReadonly,
  type Follow,
  type Master,
  type PlanState,
  type ReadonlyAccount,
  type Review,
} from "./types.ts";
import { createDict, isRecord, usernameKey } from "./util.ts";

/**
 * The saved form of the master (download file and browser storage). Compact: anything
 * that can be recomputed is left out, and default values are omitted.
 */
export interface MasterFile {
  version: typeof FORMAT_VERSION;
  lastSavedAt?: string;
  lastImportAt: string;
  /** Keyed by lower-cased username. */
  accounts: Record<string, AccountRecord>;
}

export interface AccountRecord {
  username: string;
  /** Present when you follow them; null when the export gave no time. */
  followingSince?: number | null;
  /** Present when they follow you; null when the export gave no time. */
  followerSince?: number | null;
  /** Omitted while it is the default (never reviewed, no tags, no notes). */
  review?: Review;
  /** Present only while marked. */
  toUnfollow?: PlanState;
  toRemove?: PlanState;
  /** Present only after you stopped following them (and until you follow again). */
  unfollowedSeenAt?: string;
  /** Present only after they stopped following you (and until they follow again). */
  unfollowedMeSeenAt?: string;
}

export class MasterFormatError extends Error {
  override name = "MasterFormatError";
}

// ── Writing ──────────────────────────────────────────────────────────────────

function isDefaultReview(r: DeepReadonly<Review>): boolean {
  return !r.reviewed && !r.unavailable && r.tags.length === 0 && r.notes === "";
}

export function toAccountRecord(account: ReadonlyAccount): AccountRecord {
  const { following, followedBy, review } = account;
  const out: AccountRecord = { username: account.username };
  if (following) out.followingSince = following.since;
  if (followedBy) out.followerSince = followedBy.since;
  if (!isDefaultReview(review)) out.review = { ...review, tags: [...review.tags] };
  if (account.toUnfollow) out.toUnfollow = account.toUnfollow;
  if (account.toRemove) out.toRemove = account.toRemove;
  if (account.unfollowedSeenAt) out.unfollowedSeenAt = account.unfollowedSeenAt;
  if (account.unfollowedMeSeenAt) out.unfollowedMeSeenAt = account.unfollowedMeSeenAt;
  return out;
}

/** Whether two accounts would be written to the master file identically. */
export function sameAccountRecord(a: ReadonlyAccount, b: ReadonlyAccount): boolean {
  return a === b || JSON.stringify(toAccountRecord(a)) === JSON.stringify(toAccountRecord(b));
}

export function toMasterFile(master: DeepReadonly<Master>): MasterFile {
  const accounts: Record<string, AccountRecord> = {};
  for (const [key, account] of Object.entries(master.accounts)) accounts[key] = toAccountRecord(account);
  return {
    version: FORMAT_VERSION,
    ...(master.lastSavedAt === undefined ? {} : { lastSavedAt: master.lastSavedAt }),
    lastImportAt: master.lastImportAt,
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

function bool(value: unknown, path: string): boolean {
  return typeof value === "boolean" ? value : fail(path, "true or false");
}

function numOrNull(value: unknown, path: string): number | null {
  return value === null || (typeof value === "number" && Number.isFinite(value)) ? value : fail(path, "a number or null");
}

/** One of a constant object's values, e.g. oneOf(value, PLAN_STATES, path). */
function oneOf<T extends string>(value: unknown, options: Readonly<Record<string, T>>, path: string): T {
  const allowed: readonly unknown[] = Object.values(options);
  return allowed.includes(value) ? (value as T) : fail(path, `one of ${allowed.join(", ")}`);
}

/** Rejected rather than dropped: losing a field silently could lose your work. */
function rejectUnknownFields(r: Record<string, unknown>, known: ReadonlySet<string>, path: string): void {
  for (const key of Object.keys(r)) {
    if (!known.has(key)) throw new MasterFormatError(`Invalid master file: ${path}.${key} is not a known field.`);
  }
}

function strings(value: unknown, path: string): string[] {
  return array(value, path).map((item, i) => str(item, `${path}[${i}]`));
}

const REVIEW_FIELDS: ReadonlySet<string> = new Set(["reviewed", "unavailable", "tags", "notes"] satisfies (keyof Review)[]);

function parseReview(value: unknown, path: string): Review {
  const r = record(value, path);
  rejectUnknownFields(r, REVIEW_FIELDS, path);
  return {
    reviewed: bool(r.reviewed, `${path}.reviewed`),
    unavailable: bool(r.unavailable, `${path}.unavailable`),
    tags: strings(r.tags, `${path}.tags`),
    notes: str(r.notes, `${path}.notes`),
  };
}

function date(value: unknown, path: string): string {
  return typeof value === "string" && !Number.isNaN(Date.parse(value)) ? value : fail(path, "a date");
}

/** A follow is recorded by the presence of its "since" field (null = time unknown). */
function follow(present: boolean, since: unknown, path: string): Follow | null {
  return present ? { since: numOrNull(since, path) } : null;
}

const ACCOUNT_FIELDS: ReadonlySet<string> = new Set([
  "username", "followingSince", "followerSince", "review", "toUnfollow", "toRemove", "unfollowedSeenAt", "unfollowedMeSeenAt",
] satisfies (keyof AccountRecord)[]);

/** Builds the working account from its saved record. */
export function fromAccountRecord(value: unknown, path: string): Account {
  const r = record(value, path);
  rejectUnknownFields(r, ACCOUNT_FIELDS, path);
  const account: Account = {
    username: nonEmptyStr(r.username, `${path}.username`),
    following: follow("followingSince" in r, r.followingSince, `${path}.followingSince`),
    followedBy: follow("followerSince" in r, r.followerSince, `${path}.followerSince`),
    review: r.review === undefined ? createReview() : parseReview(r.review, `${path}.review`),
  };
  if (r.toUnfollow !== undefined) account.toUnfollow = oneOf(r.toUnfollow, PLAN_STATES, `${path}.toUnfollow`);
  if (r.toRemove !== undefined) account.toRemove = oneOf(r.toRemove, PLAN_STATES, `${path}.toRemove`);
  if (r.unfollowedSeenAt !== undefined) account.unfollowedSeenAt = date(r.unfollowedSeenAt, `${path}.unfollowedSeenAt`);
  if (r.unfollowedMeSeenAt !== undefined) account.unfollowedMeSeenAt = date(r.unfollowedMeSeenAt, `${path}.unfollowedMeSeenAt`);
  return account;
}

/**
 * The single entry point for a master coming from outside (file import, browser
 * storage). Accepts only the current format and returns a fresh working master.
 * Unknown top-level fields are dropped; unknown account fields are rejected. Never mutates `raw`.
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
    accounts,
    lastImportAt: nonEmptyStr(raw.lastImportAt, "lastImportAt"),
  };
  if (raw.lastSavedAt !== undefined) master.lastSavedAt = str(raw.lastSavedAt, "lastSavedAt");
  return master;
}
