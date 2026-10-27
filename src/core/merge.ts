import { confirmPendingActions, createActions, type ActionCounts } from "./actions.ts";
import { emptyMaster, parseMaster } from "./parseMaster.ts";
import { dedupeAccounts } from "./parse.ts";
import { createReview } from "./review.ts";
import { computeCurrent, syncCurrentRelationship } from "./scopes.ts";
import type { Master, ParsedAccount, Snapshot, SnapshotChanges } from "./types.ts";
import { profileUrl, usernameKey } from "./util.ts";

/** Parsed contents of one Instagram export (possibly several follower chunk files). */
export interface ExportBundle {
  following: readonly ParsedAccount[];
  followers: readonly ParsedAccount[];
  followerFileCount: number;
}

export interface MergeResult {
  snapshotCreated: boolean;
  /** Change set of the new snapshot, or of the latest stored snapshot if the export was identical. */
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

function sameUsernameSet(snapshotUsers: readonly string[], current: ReadonlySet<string>): boolean {
  const keys = snapshotUsers.map(usernameKey);
  if (keys.length !== current.size) return false;
  const keySet = new Set(keys);
  for (const username of current) {
    if (!keySet.has(username)) return false;
  }
  return true;
}

/** Copy (or empty set for the first snapshot), so the result never aliases master data. */
function copyChanges(changes: SnapshotChanges | undefined): SnapshotChanges {
  return {
    newly_following: [...(changes?.newly_following ?? [])],
    stopped_following: [...(changes?.stopped_following ?? [])],
    new_followers: [...(changes?.new_followers ?? [])],
    lost_followers: [...(changes?.lost_followers ?? [])],
  };
}

/**
 * WRITE: applies a fresh export to a parsed master (mutated in place):
 * syncs every account's current relationship, appends a snapshot when either
 * username set differs from the latest one, and confirms pending actions.
 */
export function mergeExports(master: Master, bundle: ExportBundle, now: string): MergeResult {
  const following = dedupeAccounts(bundle.following);
  const followers = dedupeAccounts(bundle.followers);

  const latestStored = master.snapshots.at(-1) ?? null;
  const previousFollowing = new Set((latestStored?.following ?? []).map(usernameKey));
  const previousFollowers = new Set((latestStored?.followers ?? []).map(usernameKey));

  const followingMap = new Map(following.map(item => [usernameKey(item.username), item]));
  const followersMap = new Map(followers.map(item => [usernameKey(item.username), item]));
  const currentFollowing = new Set(followingMap.keys());
  const currentFollowers = new Set(followersMap.keys());
  const allKeys = new Set([...Object.keys(master.accounts).map(usernameKey), ...currentFollowing, ...currentFollowers]);

  for (const key of allKeys) {
    const followingItem = followingMap.get(key);
    const followerItem = followersMap.get(key);
    let account = master.accounts[key];

    if (!account) {
      const source = followingItem ?? followerItem;
      if (!source) continue; // unreachable: every key comes from accounts or an export
      account = master.accounts[key] = {
        username: source.username,
        url: source.url || profileUrl(source.username),
        review: createReview(),
        current: computeCurrent(null, null), // overwritten below
        actions: createActions(),
      };
    }

    const sourceItem = followingItem ?? followerItem;
    if (sourceItem) {
      account.username = sourceItem.username;
      account.url = sourceItem.url || account.url;
    }

    syncCurrentRelationship(account, followingItem, followerItem);
  }

  const isDuplicate = !!latestStored &&
    sameUsernameSet(latestStored.following, currentFollowing) &&
    sameUsernameSet(latestStored.followers, currentFollowers);

  let confirmationSnapshot: Snapshot | null = latestStored;
  let changes = copyChanges(latestStored?.changes);

  if (!isDuplicate) {
    const displayName = (key: string) => master.accounts[key]?.username ?? key;
    changes = {
      newly_following: [...currentFollowing].filter(key => !previousFollowing.has(key)).map(displayName),
      stopped_following: [...previousFollowing].filter(key => !currentFollowing.has(key)).map(displayName),
      new_followers: [...currentFollowers].filter(key => !previousFollowers.has(key)).map(displayName),
      lost_followers: [...previousFollowers].filter(key => !currentFollowers.has(key)).map(displayName),
    };

    const snapshot: Snapshot = {
      captured_at: now,
      following: following.map(item => item.username),
      followers: followers.map(item => item.username),
      // The very first snapshot has nothing to compare with.
      ...(latestStored ? { changes: copyChanges(changes) } : {}),
    };
    master.snapshots.push(snapshot);
    confirmationSnapshot = snapshot;
  }

  const confirmed = confirmPendingActions(master, confirmationSnapshot);

  return {
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
  const master = isNewMaster ? emptyMaster() : parseMaster(rawMaster);
  const merge = mergeExports(master, bundle, now);

  return {
    ...merge,
    master,
    isNewMaster,
    dirty: isNewMaster || merge.snapshotCreated || merge.confirmed.total > 0,
    followerFileCount: bundle.followerFileCount,
  };
}
