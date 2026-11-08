import { isRecord } from '@/shared/lib/checks.ts';
import { createDict } from '@/shared/lib/createDict.ts';
import type { DeepReadonly } from '@/shared/lib/deepReadonly.ts';

import { accountOf, copyDecision, type ChangedAccounts } from './account.ts';
import { FIELD_TYPES, IMPORT_PROBLEMS, ImportError, type FieldType } from './importProblems.ts';
import { createReview } from './review.ts';
import {
  ACTION_TYPES,
  DecisionKind,
  FORMAT_VERSION,
  PLAN_STATES,
  type Account,
  type ActionType,
  type Decision,
  type Follow,
  type ImportFacts,
  type Master,
  type Plans,
  type ReadonlyAccount,
  type RenameSuggestion,
  type Review,
} from './types.ts';
import { usernameKey } from './util.ts';

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
  /** Omitted while the account needs a decision. */
  decision?: Decision;
  /** Omitted while it is the default (available, no tags, no notes). */
  review?: Review;
  /** Present only while after `lastSavedAt` (see keptSeenAt). */
  followedSeenAt?: string;
  followedMeSeenAt?: string;
  /** Present only after you stopped following them (and until you follow again). */
  unfollowedSeenAt?: string;
  /** Present only after they stopped following you (and until they follow again). */
  unfollowedMeSeenAt?: string;
  /** Present only while a likely rename waits for a decision; `plans` omitted when empty. */
  renameSuggestion?: { to: string; plans?: ActionType[] };
}

// ── Writing ──────────────────────────────────────────────────────────────────

function isDefaultReview(r: DeepReadonly<Review>): boolean {
  return !r.unavailable && r.tags.length === 0 && r.notes === '';
}

/**
 * A follow's first-seen date is only compared with the save the change lists count from: one that
 * isn't after it (or with no save yet, when everything counts) changes nothing, so it isn't written.
 * Every one is older than a new save, so a downloaded master holds none.
 */
function keptSeenAt(seenAt: string | undefined, savedAt: string | undefined): seenAt is string {
  return seenAt !== undefined && savedAt !== undefined && Date.parse(seenAt) > Date.parse(savedAt);
}

/** `savedAt` is the lastSavedAt of the master the record is written into (see keptSeenAt). */
export function toAccountRecord(account: ReadonlyAccount, savedAt: string | undefined): AccountRecord {
  const { following, followedBy, review } = account;
  const out: AccountRecord = { username: account.username };
  if (following) {
    out.followingSince = following.since;
  }
  if (followedBy) {
    out.followerSince = followedBy.since;
  }
  if (account.decision) {
    out.decision = copyDecision(account.decision);
  }
  if (!isDefaultReview(review)) {
    out.review = { ...review, tags: [...review.tags] };
  }
  if (keptSeenAt(account.followedSeenAt, savedAt)) {
    out.followedSeenAt = account.followedSeenAt;
  }
  if (keptSeenAt(account.followedMeSeenAt, savedAt)) {
    out.followedMeSeenAt = account.followedMeSeenAt;
  }
  if (account.unfollowedSeenAt) {
    out.unfollowedSeenAt = account.unfollowedSeenAt;
  }
  if (account.unfollowedMeSeenAt) {
    out.unfollowedMeSeenAt = account.unfollowedMeSeenAt;
  }
  const suggestion = account.renameSuggestion;
  if (suggestion) {
    out.renameSuggestion = suggestion.plans.length
      ? { to: suggestion.to, plans: [...suggestion.plans] }
      : { to: suggestion.to };
  }
  return out;
}

/**
 * The saved record as text, with tags sorted (toAccountRecord copies them, so the account is untouched).
 * First-seen dates are left out: only imports set them, never an edit.
 */
function comparableRecord(account: ReadonlyAccount): string {
  const record = toAccountRecord(account, undefined);
  record.review?.tags.sort();
  return JSON.stringify(record);
}

/** Whether two accounts hold the same data. Tag order doesn't matter, as in the Unsaved changes list. */
export function sameAccountData(a: ReadonlyAccount, b: ReadonlyAccount): boolean {
  return a === b || comparableRecord(a) === comparableRecord(b);
}

export function toMasterFile(master: DeepReadonly<Master>): MasterFile {
  const accounts = createDict<AccountRecord>();
  for (const [key, account] of Object.entries(master.accounts)) {
    accounts[key] = toAccountRecord(account, master.lastSavedAt);
  }
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
  const accountLines = Object.entries(accounts).map(
    ([key, value]) => `    ${JSON.stringify(key)}: ${JSON.stringify(value)}`,
  );
  return `{\n${headLines.join(',\n')},\n  "accounts": {\n${accountLines.join(',\n')}\n  }\n}\n`;
}

// ── Reading: strict, each reader names the offending field ──────────────────

function fail(path: string, expected: Exclude<FieldType, typeof FIELD_TYPES.ONE_OF>): never {
  throw new ImportError({ kind: IMPORT_PROBLEMS.INVALID_FIELD, path, expected });
}

function record(value: unknown, path: string): Record<string, unknown> {
  return isRecord(value) ? value : fail(path, FIELD_TYPES.OBJECT);
}

function array(value: unknown, path: string): unknown[] {
  return Array.isArray(value) ? value : fail(path, FIELD_TYPES.LIST);
}

function str(value: unknown, path: string): string {
  return typeof value === 'string' ? value : fail(path, FIELD_TYPES.TEXT);
}

function nonEmptyStr(value: unknown, path: string): string {
  return typeof value === 'string' && value ? value : fail(path, FIELD_TYPES.NON_EMPTY_TEXT);
}

function bool(value: unknown, path: string): boolean {
  return typeof value === 'boolean' ? value : fail(path, FIELD_TYPES.BOOLEAN);
}

function numOrNull(value: unknown, path: string): number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
    ? value
    : fail(path, FIELD_TYPES.NUMBER_OR_NULL);
}

function wholeNumber(value: unknown, path: string): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fail(path, FIELD_TYPES.WHOLE_NUMBER);
}

/** One of a constant object's values, e.g. oneOf(value, PLAN_STATES, path). */
function oneOf<T extends string>(value: unknown, options: Readonly<Record<string, T>>, path: string): T {
  const allowed: readonly string[] = Object.values(options);
  if (typeof value === 'string' && allowed.includes(value)) {
    return value as T;
  }
  throw new ImportError({
    kind: IMPORT_PROBLEMS.INVALID_FIELD,
    path,
    expected: FIELD_TYPES.ONE_OF,
    options: [...allowed],
  });
}

/** Rejected rather than dropped: losing a field silently could lose your work. */
function rejectUnknownFields(r: Record<string, unknown>, known: ReadonlySet<string>, path: string): void {
  for (const key of Object.keys(r)) {
    if (!known.has(key)) {
      throw new ImportError({ kind: IMPORT_PROBLEMS.UNKNOWN_FIELD, path: `${path}.${key}` });
    }
  }
}

function strings(value: unknown, path: string): string[] {
  return array(value, path).map((item, i) => str(item, `${path}[${i}]`));
}

const REVIEW_FIELDS: ReadonlySet<string> = new Set(['unavailable', 'tags', 'notes'] satisfies (keyof Review)[]);

function parseReview(value: unknown, path: string): Review {
  const r = record(value, path);
  rejectUnknownFields(r, REVIEW_FIELDS, path);
  return {
    unavailable: bool(r.unavailable, `${path}.unavailable`),
    tags: strings(r.tags, `${path}.tags`),
    notes: str(r.notes, `${path}.notes`),
  };
}

function date(value: unknown, path: string): string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : fail(path, FIELD_TYPES.DATE);
}

/** A follow is recorded by the presence of its "since" field (null = time unknown). */
function follow(present: boolean, since: unknown, path: string): Follow | null {
  return present ? { since: numOrNull(since, path) } : null;
}

const RENAME_FIELDS: ReadonlySet<string> = new Set(['to', 'plans'] satisfies (keyof RenameSuggestion)[]);

function parseRenameSuggestion(value: unknown, path: string): RenameSuggestion {
  const r = record(value, path);
  rejectUnknownFields(r, RENAME_FIELDS, path);
  const plans =
    r.plans === undefined
      ? []
      : array(r.plans, `${path}.plans`).map((type, i) => oneOf(type, ACTION_TYPES, `${path}.plans[${i}]`));
  return { to: nonEmptyStr(r.to, `${path}.to`), plans };
}

const KEPT_FIELDS: ReadonlySet<string> = new Set(['kind']);
const QUEUED_FIELDS: ReadonlySet<string> = new Set(['kind', 'plans']);
const PLAN_FIELDS: ReadonlySet<string> = new Set(Object.values(ACTION_TYPES));

/** Kept, or queued with at least one plan. */
function parseDecision(value: unknown, path: string): Decision {
  const r = record(value, path);
  const kind = oneOf(r.kind, DecisionKind, `${path}.kind`);
  if (kind === DecisionKind.KEPT) {
    rejectUnknownFields(r, KEPT_FIELDS, path);
    return { kind };
  }
  rejectUnknownFields(r, QUEUED_FIELDS, path);
  const raw = record(r.plans, `${path}.plans`);
  rejectUnknownFields(raw, PLAN_FIELDS, `${path}.plans`);
  const plans: Plans = {};
  for (const type of Object.values(ACTION_TYPES)) {
    if (raw[type] !== undefined) {
      plans[type] = oneOf(raw[type], PLAN_STATES, `${path}.plans.${type}`);
    }
  }
  if (Object.keys(plans).length === 0) {
    fail(`${path}.plans`, FIELD_TYPES.NON_EMPTY_OBJECT);
  }
  return { kind, plans };
}

const ACCOUNT_FIELDS: ReadonlySet<string> = new Set([
  'username',
  'followingSince',
  'followerSince',
  'decision',
  'review',
  'followedSeenAt',
  'followedMeSeenAt',
  'unfollowedSeenAt',
  'unfollowedMeSeenAt',
  'renameSuggestion',
] satisfies (keyof AccountRecord)[]);

/** Builds the working account from its saved record. */
export function fromAccountRecord(value: unknown, path: string): Account {
  const r = record(value, path);
  rejectUnknownFields(r, ACCOUNT_FIELDS, path);
  const account: Account = {
    username: nonEmptyStr(r.username, `${path}.username`),
    following: follow('followingSince' in r, r.followingSince, `${path}.followingSince`),
    followedBy: follow('followerSince' in r, r.followerSince, `${path}.followerSince`),
    review: r.review === undefined ? createReview() : parseReview(r.review, `${path}.review`),
  };
  if (r.decision !== undefined) {
    account.decision = parseDecision(r.decision, `${path}.decision`);
  }
  if (r.followedSeenAt !== undefined) {
    account.followedSeenAt = date(r.followedSeenAt, `${path}.followedSeenAt`);
  }
  if (r.followedMeSeenAt !== undefined) {
    account.followedMeSeenAt = date(r.followedMeSeenAt, `${path}.followedMeSeenAt`);
  }
  if (r.unfollowedSeenAt !== undefined) {
    account.unfollowedSeenAt = date(r.unfollowedSeenAt, `${path}.unfollowedSeenAt`);
  }
  if (r.unfollowedMeSeenAt !== undefined) {
    account.unfollowedMeSeenAt = date(r.unfollowedMeSeenAt, `${path}.unfollowedMeSeenAt`);
  }
  if (r.renameSuggestion !== undefined) {
    account.renameSuggestion = parseRenameSuggestion(r.renameSuggestion, `${path}.renameSuggestion`);
  }
  return account;
}

/**
 * The single entry point for a master coming from outside (file import, browser
 * storage). Accepts only the current format and returns a fresh working master.
 * Unknown top-level fields are dropped; unknown account fields are rejected. Never mutates `raw`.
 */
const IMPORT_FACTS_FIELDS: ReadonlySet<string> = new Set([
  'followingBefore',
  'followersBefore',
  'completedPlans',
] satisfies (keyof ImportFacts)[]);

/** Strict reader for ImportFacts as stored in the tab's backup (they are never in the master file). */
function parseImportFacts(value: unknown, path: string): ImportFacts {
  const r = record(value, path);
  rejectUnknownFields(r, IMPORT_FACTS_FIELDS, path);
  const count = (field: string) =>
    numOrNull(r[field], `${path}.${field}`) ?? fail(`${path}.${field}`, FIELD_TYPES.NUMBER_OR_NULL);
  const completedPlans = createDict<ActionType[]>();
  for (const [key, types] of Object.entries(record(r.completedPlans, `${path}.completedPlans`))) {
    const itemPath = `${path}.completedPlans.${key}`;
    completedPlans[key] = array(types, itemPath).map((type, i) => oneOf(type, ACTION_TYPES, `${itemPath}[${i}]`));
  }
  return { followingBefore: count('followingBefore'), followersBefore: count('followersBefore'), completedPlans };
}

/** What the browser backup keeps besides the master and the changed accounts. */
export interface BackupMeta {
  revision: number;
  savedRevision: number;
  /** The master's lastSavedAt, which changes on every save. */
  lastSavedAt?: string;
  /** What the import found besides the master (see ImportFacts). */
  importFacts: ImportFacts;
}

/**
 * Strict reader for BackupMeta as stored in the browser backup. Unknown fields are ignored: one a past version wrote
 * is harmless, while a missing or renamed one is caught.
 */
export function parseBackupMeta(value: unknown, path: string): BackupMeta {
  const r = record(value, path);
  return {
    revision: wholeNumber(r.revision, `${path}.revision`),
    savedRevision: wholeNumber(r.savedRevision, `${path}.savedRevision`),
    ...(r.lastSavedAt === undefined ? {} : { lastSavedAt: date(r.lastSavedAt, `${path}.lastSavedAt`) }),
    importFacts: parseImportFacts(r.importFacts, `${path}.importFacts`),
  };
}

export function parseMaster(raw: unknown): Master {
  if (!isRecord(raw) || !isRecord(raw.accounts)) {
    throw new ImportError({ kind: IMPORT_PROBLEMS.NOT_A_MASTER });
  }
  if (raw.version !== FORMAT_VERSION) {
    throw new ImportError({ kind: IMPORT_PROBLEMS.INCOMPATIBLE_VERSION });
  }

  const accounts = createDict<Account>();
  for (const [rawKey, value] of Object.entries(raw.accounts)) {
    const account = fromAccountRecord(value, `accounts.${rawKey}`);
    const key = usernameKey(account.username);
    if (Object.hasOwn(accounts, key)) {
      throw new ImportError({ kind: IMPORT_PROBLEMS.DUPLICATE_ACCOUNT, username: account.username });
    }
    accounts[key] = account;
  }

  const master: Master = {
    version: FORMAT_VERSION,
    accounts,
    lastImportAt: date(raw.lastImportAt, 'lastImportAt'),
  };
  if (raw.lastSavedAt !== undefined) {
    master.lastSavedAt = date(raw.lastSavedAt, 'lastSavedAt');
  }
  return master;
}

/** The full master: imported accounts with the edited ones applied, without removed ones. */
export function currentMaster(base: Master, changed: Readonly<ChangedAccounts>): Master {
  const accounts = createDict<Account>();
  for (const key of Object.keys(base.accounts)) {
    const account = accountOf(base.accounts, changed, key);
    if (account) {
      accounts[key] = account;
    }
  }
  return { ...base, accounts };
}

export function serializeMaster(master: Master, savedAt: string): string {
  return stringifyMasterFile(toMasterFile({ ...master, lastSavedAt: savedAt }));
}
