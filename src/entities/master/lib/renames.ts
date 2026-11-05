import { accountOf, type ChangedAccounts } from './account.ts';
import { followExists, keep, planOf, setPlan } from './decision.ts';
import {
  ACTION_TYPES,
  PLAN_STATES,
  type Account,
  type ExportEntry,
  type ReadonlyAccount,
  type RenameSuggestion,
} from './types.ts';

/** Where a rename pair stands on the Changes page. */
export enum RenameState {
  /** Not decided yet: neither name is listed in the other Changes sections. */
  WAITING = 'waiting',
  /** Moved to the new name: the old account is gone, the new name is not a new follow. */
  MOVED = 'moved',
  /** Not a rename: two different accounts, each listed in its own section. */
  NOT_RENAME = 'notRename',
}

/** Which follow dates matched the two names. */
export enum RenameMatch {
  /** You followed each other: both dates. */
  BOTH = 'both',
  /** Only you followed them: the following date. */
  FOLLOWING = 'following',
  /** Only they followed you: the follower date. */
  FOLLOWER = 'follower',
}

/** A rename the last import suggested, and where it stands now. */
export interface RenamePair {
  /** Key of the old username. */
  from: string;
  /** Key of the new username. */
  to: string;
  match: RenameMatch;
  state: RenameState;
}

/** A rename found by an import: the old account's key and the suggestion to put on it. */
export interface FoundRename {
  from: string;
  suggestion: RenameSuggestion;
}

/**
 * The follow dates that identify an account across a rename; null when it has no follow or a date is unknown (no
 * match then). `undefined` = no follow that way.
 */
function signature(following: number | null | undefined, followedBy: number | null | undefined): string | null {
  if (following === null || followedBy === null || (following === undefined && followedBy === undefined)) {
    return null;
  }
  return `${following ?? '-'}:${followedBy ?? '-'}`;
}

/** Signature → account key, for signatures seen exactly once; one shared by two accounts is ambiguous and dropped. */
function unique(entries: readonly (readonly [key: string, signature: string | null])[]): Map<string, string> {
  const bySignature = new Map<string, string | null>(); // null = seen more than once
  for (const [key, sig] of entries) {
    if (sig !== null) {
      bySignature.set(sig, bySignature.has(sig) ? null : key);
    }
  }
  const result = new Map<string, string>();
  for (const [sig, key] of bySignature) {
    if (key !== null) {
      result.set(sig, key);
    }
  }
  return result;
}

/**
 * Likely renames in a fresh export, read before the follows are updated (`accounts` still holds
 * the previous ones). Old side: accounts gone from the export entirely. New side: usernames not seen before.
 * Matched when both have the same follow dates in the same directions (follower date, following date, or both),
 * and those dates occur on exactly one account of each side.
 */
export function findRenames(
  accounts: Readonly<Record<string, ReadonlyAccount>>,
  following: ReadonlyMap<string, ExportEntry>,
  followers: ReadonlyMap<string, ExportEntry>,
): FoundRename[] {
  const gone = unique(
    Object.entries(accounts)
      .filter(([key]) => !followers.has(key) && !following.has(key))
      .map(([key, account]) => [key, signature(account.following?.since, account.followedBy?.since)] as const),
  );
  const appeared = unique(
    [...new Set([...followers.keys(), ...following.keys()])]
      .filter(key => !Object.hasOwn(accounts, key))
      .map(key => [key, signature(following.get(key)?.since, followers.get(key)?.since)] as const),
  );

  const found: FoundRename[] = [];
  for (const [sig, from] of gone) {
    const to = appeared.get(sig);
    const old = accounts[from];
    if (to === undefined || !old) {
      continue;
    }
    found.push({
      from,
      suggestion: { to, plans: Object.values(ACTION_TYPES).filter(type => planOf(old, type) !== undefined) },
    });
  }
  return found;
}

/**
 * WRITE: after an import has updated the follows, drops open suggestions that no longer hold:
 * the old name is back in the export, or the new name is gone from it.
 */
export function settleRenameSuggestions(accounts: Record<string, Account>): void {
  for (const account of Object.values(accounts)) {
    const suggestion = account.renameSuggestion;
    if (!suggestion) {
      continue;
    }
    const target = accounts[suggestion.to];
    if (account.following || account.followedBy || !(target?.following || target?.followedBy)) {
      delete account.renameSuggestion;
    }
  }
}

/** The old accounts the import left a rename suggestion on, in username order. */
export function suggestedRenames(accounts: Readonly<Record<string, ReadonlyAccount>>): readonly string[] {
  return Object.entries(accounts)
    .filter(([, account]) => account.renameSuggestion !== undefined)
    .sort(([, a], [, b]) => a.username.localeCompare(b.username))
    .map(([key]) => key);
}

/**
 * The renames the import suggested (`fromKeys`, see suggestedRenames) and where each stands after the edits: still
 * suggested = waiting, the old account removed = moved, the suggestion gone = not a rename.
 */
export function renamePairs(
  base: Readonly<Record<string, ReadonlyAccount>>,
  changed: Readonly<ChangedAccounts<ReadonlyAccount>>,
  fromKeys: readonly string[],
): RenamePair[] {
  return fromKeys.flatMap(from => {
    const to = base[from]?.renameSuggestion?.to;
    // The old name's follows are cleared by the import (it's gone): the new name has the matched ones.
    const target = to === undefined ? undefined : base[to];
    if (to === undefined || !target) {
      return [];
    }
    const now = accountOf(base, changed, from);
    const state = !now ? RenameState.MOVED : now.renameSuggestion ? RenameState.WAITING : RenameState.NOT_RENAME;
    const match =
      target.following && target.followedBy
        ? RenameMatch.BOTH
        : target.following
          ? RenameMatch.FOLLOWING
          : RenameMatch.FOLLOWER;
    return [{ from, to, match, state }];
  });
}

/** Account keys the other Changes sections leave out: both names while waiting, the new name once moved. */
export function renameHiddenKeys(pairs: readonly RenamePair[]): ReadonlySet<string> {
  return new Set(
    pairs.flatMap(({ from, to, state }) =>
      state === RenameState.WAITING ? [from, to] : state === RenameState.MOVED ? [to] : [],
    ),
  );
}

/** Joins merged notes. */
const NOTE_SEPARATOR = ' · ';

/**
 * WRITE (to `target`): moves the old account's review work onto its new name. Tags are combined,
 * notes joined with NOTE_SEPARATOR, Kept if either was decided. The old account's plans (kept on its suggestion)
 * come back as planned where that follow exists on the new name. Unavailable is not moved: the
 * account clearly still exists.
 */
export function mergeRenamed(target: Account, old: ReadonlyAccount): void {
  const review = target.review;
  for (const tag of old.review.tags) {
    if (!review.tags.includes(tag)) {
      review.tags.push(tag);
    }
  }
  review.notes = [review.notes, old.review.notes].filter(Boolean).join(NOTE_SEPARATOR);
  if (target.decision === undefined && old.decision !== undefined) {
    keep(target);
  }
  for (const type of old.renameSuggestion?.plans ?? []) {
    if (planOf(target, type) === undefined && followExists(target, type)) {
      setPlan(target, type, PLAN_STATES.PLANNED);
    }
  }
}
