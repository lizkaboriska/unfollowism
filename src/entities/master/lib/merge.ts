import { createDict } from '@/shared/lib/createDict.ts';

import { createAccount } from './account.ts';
import { settleDecisions, totalOf, type PlanOutcomes, type SettledDecisions } from './actions.ts';
import { IMPORT_PROBLEMS, ImportError } from './importProblems.ts';
import { parseMaster } from './masterFile.ts';
import { dedupeAccounts } from './parse.ts';
import { findRenames, settleRenameSuggestions } from './renames.ts';
import { setFollows } from './scopes.ts';
import { FORMAT_VERSION, type Account, type ExportEntry, type Follow, type ImportFacts, type Master } from './types.ts';
import { usernameKey } from './util.ts';

/** Parsed contents of one Instagram export (possibly several follower chunk files). */
export interface ExportBundle {
  following: readonly ExportEntry[];
  followers: readonly ExportEntry[];
  followerFileCount: number;
}

export interface ImportResult {
  master: Master;
  facts: ImportFacts;
  /** False when the export has exactly the same following/followers, with the same dates, as the previous import. */
  exportChanged: boolean;
  /** Plans this import found done, and "done" plans it found not done after all (back in To do). */
  plans: PlanOutcomes;
  /** Whether the imported state differs from the master file and should be saved. */
  dirty: boolean;
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  if (left.size !== right.size) {
    return false;
  }
  for (const key of left) {
    if (!right.has(key)) {
      return false;
    }
  }
  return true;
}

/** Whether a follow that is still there has a different "since" in the new export. */
function redated(previous: Follow | null, entry: ExportEntry | undefined): boolean {
  return previous !== null && entry !== undefined && previous.since !== entry.since;
}

/**
 * WRITE: applies a fresh export to the accounts (mutated in place): finds likely renames while
 * the old follow dates are still there, updates the follows, dates the ones that stopped (`now`),
 * and, when `accounts` come from a saved master (`saved`), the ones that appeared; puts rename
 * suggestions on the old accounts (dropping earlier ones that no longer hold), and settles decisions
 * against the follows.
 */
export function mergeExports(
  accounts: Record<string, Account>,
  bundle: ExportBundle,
  now: string,
  saved: boolean,
): { exportChanged: boolean; followingBefore: number; followersBefore: number } & SettledDecisions {
  const following = new Map(dedupeAccounts(bundle.following).map(entry => [usernameKey(entry.username), entry]));
  const followers = new Map(dedupeAccounts(bundle.followers).map(entry => [usernameKey(entry.username), entry]));
  const renames = findRenames(accounts, following, followers);

  const previousFollowing = new Set<string>();
  const previousFollowers = new Set<string>();
  for (const [key, account] of Object.entries(accounts)) {
    if (account.following) {
      previousFollowing.add(key);
    }
    if (account.followedBy) {
      previousFollowers.add(key);
    }
  }
  let exportChanged =
    !sameSet(previousFollowing, new Set(following.keys())) || !sameSet(previousFollowers, new Set(followers.keys()));

  for (const key of new Set([...Object.keys(accounts), ...following.keys(), ...followers.keys()])) {
    const followingEntry = following.get(key);
    const followerEntry = followers.get(key);
    const source = followingEntry ?? followerEntry;
    let account = accounts[key];
    if (!account) {
      if (!source) {
        continue;
      } // unreachable: every key comes from accounts or an export
      account = accounts[key] = createAccount(source.username);
    }
    // Same people, but a follow re-dated (e.g. unfollowed and followed again between exports).
    if (redated(account.following, followingEntry) || redated(account.followedBy, followerEntry)) {
      exportChanged = true;
    }
    if (source) {
      account.username = source.username;
    } // casing follows the newest export
    setFollows(account, followingEntry, followerEntry, now, saved);
  }

  settleRenameSuggestions(accounts);
  for (const { from, suggestion } of renames) {
    const account = accounts[from];
    if (account) {
      account.renameSuggestion = suggestion;
    }
  }

  const settled = settleDecisions(
    { accounts },
    {
      uncounted: new Set(renames.map(rename => rename.from)),
      lostFollowers: new Set([...previousFollowers].filter(key => !followers.has(key))),
    },
  );
  return {
    exportChanged,
    followingBefore: previousFollowing.size,
    followersBefore: previousFollowers.size,
    ...settled,
  };
}

/**
 * Pure: raw master (or null for a first-time user) + parsed export → new master.
 * parseMaster → mergeExports (incl. settleDecisions), with an injected clock.
 */
export function importExport(rawMaster: unknown, bundle: ExportBundle, now: string): ImportResult {
  if (!bundle.following.length) {
    throw new ImportError({ kind: IMPORT_PROBLEMS.NO_FOLLOWING });
  }
  if (!bundle.followers.length) {
    throw new ImportError({ kind: IMPORT_PROBLEMS.NO_FOLLOWERS });
  }

  const isNewMaster = rawMaster == null;
  const base = isNewMaster ? null : parseMaster(rawMaster);
  const accounts = base?.accounts ?? createDict<Account>();
  const { exportChanged, plans, completedPlans, undecided, followingBefore, followersBefore } = mergeExports(
    accounts,
    bundle,
    now,
    base?.lastSavedAt !== undefined,
  );
  const master: Master = {
    version: FORMAT_VERSION,
    accounts,
    // Re-importing the same export doesn't make the data any newer.
    lastImportAt: exportChanged || !base ? now : base.lastImportAt,
    ...(base?.lastSavedAt === undefined ? {} : { lastSavedAt: base.lastSavedAt }),
  };

  const decisionsSettled = totalOf(plans.completed) + totalOf(plans.reopened) + undecided > 0;
  return {
    master,
    facts: { followingBefore, followersBefore, completedPlans },
    exportChanged,
    plans,
    dirty: isNewMaster || exportChanged || decisionsSettled,
  };
}
