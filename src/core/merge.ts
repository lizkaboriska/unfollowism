import { createAccount } from "./account.ts";
import { confirmPendingActions, type ActionCounts } from "./actions.ts";
import { parseMaster } from "./masterFile.ts";
import { dedupeAccounts } from "./parse.ts";
import { setFollows } from "./scopes.ts";
import { DEFAULT_TAG_OPTIONS, FOLLOWER_CHANGES, FORMAT_VERSION, type Account, type ExportEntry, type Master } from "./types.ts";
import { createDict, usernameKey } from "./util.ts";

/** Parsed contents of one Instagram export (possibly several follower chunk files). */
export interface ExportBundle {
  following: readonly ExportEntry[];
  followers: readonly ExportEntry[];
  followerFileCount: number;
}

/** What an import found, for the status message. */
export interface ImportSummary {
  /** False when the export has exactly the same following/followers as the previous import. */
  exportChanged: boolean;
  followingCount: number;
  followersCount: number;
  /** Accounts marked as new/lost followers (by this import, or by the previous one if the export is unchanged). */
  newFollowers: number;
  lostFollowers: number;
  confirmed: ActionCounts;
}

export interface ImportResult {
  master: Master;
  summary: ImportSummary;
  isNewMaster: boolean;
  /** Whether the imported state differs from the master file and should be saved. */
  dirty: boolean;
  followerFileCount: number;
}

export class ImportError extends Error {
  override name = "ImportError";
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

function difference(a: ReadonlySet<string>, b: ReadonlySet<string>): Set<string> {
  return new Set([...a].filter(key => !b.has(key)));
}

/**
 * WRITE: applies a fresh export to the accounts (mutated in place). Compares it with
 * the follows already on the accounts, marks new and lost followers, and confirms
 * pending actions. `firstImport` means there is nothing to compare with yet.
 */
export function mergeExports(accounts: Record<string, Account>, bundle: ExportBundle, firstImport: boolean): ImportSummary {
  const following = new Map(dedupeAccounts(bundle.following).map(entry => [usernameKey(entry.username), entry]));
  const followers = new Map(dedupeAccounts(bundle.followers).map(entry => [usernameKey(entry.username), entry]));

  const previousFollowing = new Set<string>();
  const previousFollowers = new Set<string>();
  for (const [key, account] of Object.entries(accounts)) {
    if (account.following) previousFollowing.add(key);
    if (account.followedBy) previousFollowers.add(key);
  }
  const currentFollowing = new Set(following.keys());
  const currentFollowers = new Set(followers.keys());
  const exportChanged = firstImport || !sameSet(previousFollowing, currentFollowing) || !sameSet(previousFollowers, currentFollowers);
  const newFollowers = firstImport ? new Set<string>() : difference(currentFollowers, previousFollowers);
  const lostFollowers = firstImport ? new Set<string>() : difference(previousFollowers, currentFollowers);

  for (const key of new Set([...Object.keys(accounts), ...currentFollowing, ...currentFollowers])) {
    const followingEntry = following.get(key);
    const followerEntry = followers.get(key);
    const source = followingEntry ?? followerEntry;
    let account = accounts[key];
    if (!account) {
      if (!source) continue; // unreachable: every key comes from accounts or an export
      account = accounts[key] = createAccount(source.username);
    }
    if (source) account.username = source.username; // casing follows the newest export
    setFollows(account, followingEntry, followerEntry);

    // An unchanged export keeps the markers of the import that produced it.
    if (!exportChanged) continue;
    delete account.followerChange;
    if (newFollowers.has(key)) account.followerChange = FOLLOWER_CHANGES.NEW;
    if (lostFollowers.has(key)) account.followerChange = FOLLOWER_CHANGES.LOST;
  }

  const marked = Object.values(accounts);
  return {
    exportChanged,
    followingCount: currentFollowing.size,
    followersCount: currentFollowers.size,
    newFollowers: marked.filter(a => a.followerChange === FOLLOWER_CHANGES.NEW).length,
    lostFollowers: marked.filter(a => a.followerChange === FOLLOWER_CHANGES.LOST).length,
    confirmed: confirmPendingActions({ accounts }, {
      stoppedFollowing: exportChanged ? difference(previousFollowing, currentFollowing) : new Set(),
      lostFollowers,
    }),
  };
}

/**
 * Pure: raw master (or null for a first-time user) + parsed export → new master.
 * parseMaster → mergeExports (incl. confirmPendingActions), with an injected clock.
 */
export function importExport(rawMaster: unknown, bundle: ExportBundle, now: string): ImportResult {
  if (!bundle.following.length) throw new ImportError("No accounts found in the Following file of this export.");
  if (!bundle.followers.length) throw new ImportError("No accounts found in the Followers files of this export.");

  const isNewMaster = rawMaster == null;
  const base = isNewMaster ? null : parseMaster(rawMaster);
  const accounts = base?.accounts ?? createDict<Account>();
  const summary = mergeExports(accounts, bundle, isNewMaster);

  const master: Master = {
    version: FORMAT_VERSION,
    tagOptions: base ? base.tagOptions : [...DEFAULT_TAG_OPTIONS],
    accounts,
    // Re-importing the same export doesn't make the data any newer.
    lastImportAt: summary.exportChanged || !base ? now : base.lastImportAt,
    ...(base?.lastSavedAt === undefined ? {} : { lastSavedAt: base.lastSavedAt }),
  };

  const confirmedAny = Object.values(summary.confirmed).some(n => n > 0);
  return {
    master,
    summary,
    isNewMaster,
    dirty: isNewMaster || summary.exportChanged || confirmedAny,
    followerFileCount: bundle.followerFileCount,
  };
}
