import { confirmPendingActions, createActions, type ActionCounts } from "./actions.ts";
import { parseMaster } from "./masterFile.ts";
import { dedupeAccounts } from "./parse.ts";
import { createReview } from "./review.ts";
import { computeCurrent, syncCurrentRelationship } from "./scopes.ts";
import { DEFAULT_TAG_OPTIONS, FORMAT_VERSION, type Account, type Master, type ParsedAccount, type Snapshot, type SnapshotChanges } from "./types.ts";
import { createDict, usernameKey } from "./util.ts";

/** Parsed contents of one Instagram export (possibly several follower chunk files). */
export interface ExportBundle {
  following: readonly ParsedAccount[];
  followers: readonly ParsedAccount[];
  followerFileCount: number;
}

export interface MergeResult {
  /** False when the export has exactly the same following/followers as the previous import. */
  snapshotCreated: boolean;
  /** Changes since the import before; for an identical export, the changes already stored. */
  changes: SnapshotChanges;
  followingCount: number;
  followersCount: number;
  confirmed: ActionCounts;
}

export interface ImportResult extends MergeResult {
  master: Master;
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

function copyChanges(changes: SnapshotChanges | undefined): SnapshotChanges {
  return {
    newly_following: [...(changes?.newly_following ?? [])],
    stopped_following: [...(changes?.stopped_following ?? [])],
    new_followers: [...(changes?.new_followers ?? [])],
    lost_followers: [...(changes?.lost_followers ?? [])],
  };
}

/**
 * WRITE: applies a fresh export to the accounts (mutated in place) and returns the
 * new snapshot plus what happened. `previous` is null for the very first import.
 */
export function mergeExports(
  accounts: Record<string, Account>,
  previous: Snapshot | null,
  bundle: ExportBundle,
  now: string,
): MergeResult & { snapshot: Snapshot } {
  const following = dedupeAccounts(bundle.following);
  const followers = dedupeAccounts(bundle.followers);

  // Who you followed / who followed you as of the previous import is recorded on the accounts.
  const previousFollowing = new Set<string>();
  const previousFollowers = new Set<string>();
  for (const [key, account] of Object.entries(accounts)) {
    if (account.current.you_follow) previousFollowing.add(key);
    if (account.current.follows_you) previousFollowers.add(key);
  }

  const followingMap = new Map(following.map(item => [usernameKey(item.username), item]));
  const followersMap = new Map(followers.map(item => [usernameKey(item.username), item]));
  const currentFollowing = new Set(followingMap.keys());
  const currentFollowers = new Set(followersMap.keys());

  for (const key of new Set([...Object.keys(accounts), ...currentFollowing, ...currentFollowers])) {
    const followingItem = followingMap.get(key);
    const followerItem = followersMap.get(key);
    const source = followingItem ?? followerItem;
    let account = accounts[key];
    if (!account) {
      if (!source) continue; // unreachable: every key comes from accounts or an export
      account = accounts[key] = { username: source.username, review: createReview(), current: computeCurrent(null, null), actions: createActions() };
    }
    if (source) account.username = source.username; // casing follows the newest export
    syncCurrentRelationship(account, followingItem, followerItem);
  }

  const isDuplicate = previous !== null && sameSet(previousFollowing, currentFollowing) && sameSet(previousFollowers, currentFollowers);
  let snapshot: Snapshot;
  let changes: SnapshotChanges;

  if (isDuplicate) {
    snapshot = previous;
    changes = copyChanges(previous.changes);
  } else {
    const displayName = (key: string) => accounts[key]?.username ?? key;
    changes = {
      newly_following: [...currentFollowing].filter(key => !previousFollowing.has(key)).map(displayName),
      stopped_following: [...previousFollowing].filter(key => !currentFollowing.has(key)).map(displayName),
      new_followers: [...currentFollowers].filter(key => !previousFollowers.has(key)).map(displayName),
      lost_followers: [...previousFollowers].filter(key => !currentFollowers.has(key)).map(displayName),
    };
    // The very first import has nothing to compare with.
    snapshot = previous ? { captured_at: now, changes: copyChanges(changes) } : { captured_at: now };
  }

  const confirmed = confirmPendingActions({ accounts }, snapshot);

  return {
    snapshot,
    snapshotCreated: !isDuplicate,
    changes,
    followingCount: currentFollowing.size,
    followersCount: currentFollowers.size,
    confirmed,
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
  const { snapshot, ...merge } = mergeExports(accounts, base?.snapshot ?? null, bundle, now);

  const master: Master = {
    version: FORMAT_VERSION,
    tag_options: base ? base.tag_options : [...DEFAULT_TAG_OPTIONS],
    accounts,
    snapshot,
    ...(base?.last_saved_at === undefined ? {} : { last_saved_at: base.last_saved_at }),
  };

  return {
    ...merge,
    master,
    isNewMaster,
    dirty: isNewMaster || merge.snapshotCreated || merge.confirmed.total > 0,
    followerFileCount: bundle.followerFileCount,
  };
}
