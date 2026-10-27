import { confirmPendingActions, createActions, type ActionCounts } from "./actions.ts";
import { parseMaster } from "./masterFile.ts";
import { dedupeAccounts } from "./parse.ts";
import { createReview } from "./review.ts";
import { computeCurrent, syncCurrentRelationship } from "./scopes.ts";
import { DEFAULT_TAG_OPTIONS, FOLLOWER_CHANGES, FORMAT_VERSION, type Account, type FollowChanges, type Master, type ParsedAccount } from "./types.ts";
import { createDict, usernameKey } from "./util.ts";

/** Parsed contents of one Instagram export (possibly several follower chunk files). */
export interface ExportBundle {
  following: readonly ParsedAccount[];
  followers: readonly ParsedAccount[];
  followerFileCount: number;
}

export interface MergeResult {
  /** False when the export has exactly the same following/followers as the previous import. */
  exportChanged: boolean;
  /** What this export changed; for an unchanged export, the new/lost followers already marked. */
  changes: FollowChanges;
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

/**
 * WRITE: applies a fresh export to the accounts (mutated in place). Compares it with
 * the follow flags already on the accounts, marks new and lost followers, and confirms
 * pending actions. `firstImport` means there is nothing to compare with yet.
 */
export function mergeExports(accounts: Record<string, Account>, bundle: ExportBundle, firstImport: boolean): MergeResult {
  const following = dedupeAccounts(bundle.following);
  const followers = dedupeAccounts(bundle.followers);

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
  const exportChanged = firstImport || !sameSet(previousFollowing, currentFollowing) || !sameSet(previousFollowers, currentFollowers);

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

    // An unchanged export keeps the markers of the import that produced it.
    if (!exportChanged) continue;
    delete account.follower_change;
    if (firstImport) continue;
    if (currentFollowers.has(key) && !previousFollowers.has(key)) account.follower_change = FOLLOWER_CHANGES.NEW;
    if (!currentFollowers.has(key) && previousFollowers.has(key)) account.follower_change = FOLLOWER_CHANGES.LOST;
  }

  const name = (key: string) => accounts[key]?.username ?? key;
  const changes: FollowChanges = exportChanged && !firstImport
    ? {
        newly_following: [...currentFollowing].filter(key => !previousFollowing.has(key)).map(name),
        stopped_following: [...previousFollowing].filter(key => !currentFollowing.has(key)).map(name),
        new_followers: [...currentFollowers].filter(key => !previousFollowers.has(key)).map(name),
        lost_followers: [...previousFollowers].filter(key => !currentFollowers.has(key)).map(name),
      }
    : {
        newly_following: firstImport ? [...currentFollowing].map(name) : [],
        stopped_following: [],
        new_followers: Object.values(accounts).filter(a => a.follower_change === FOLLOWER_CHANGES.NEW).map(a => a.username),
        lost_followers: Object.values(accounts).filter(a => a.follower_change === FOLLOWER_CHANGES.LOST).map(a => a.username),
      };

  return {
    exportChanged,
    changes,
    followingCount: currentFollowing.size,
    followersCount: currentFollowers.size,
    confirmed: confirmPendingActions({ accounts }, changes),
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
  const merge = mergeExports(accounts, bundle, isNewMaster);

  const master: Master = {
    version: FORMAT_VERSION,
    tag_options: base ? base.tag_options : [...DEFAULT_TAG_OPTIONS],
    accounts,
    // Re-importing the same export doesn't make the data any newer.
    last_import_at: merge.exportChanged || !base ? now : base.last_import_at,
    ...(base?.last_saved_at === undefined ? {} : { last_saved_at: base.last_saved_at }),
  };

  return {
    ...merge,
    master,
    isNewMaster,
    dirty: isNewMaster || merge.exportChanged || merge.confirmed.total > 0,
    followerFileCount: bundle.followerFileCount,
  };
}
