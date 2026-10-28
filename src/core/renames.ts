import { followExists, planOf, setPlan } from "./actions.ts";
import { ACTION_TYPES, PLAN_STATES, type Account, type ActionType, type ExportEntry, type ReadonlyAccount } from "./types.ts";

/**
 * A likely rename found by an import: an account that stopped following you, and a username
 * never seen before with exactly the same follow dates. Instagram exports have no account id,
 * so this is the only trace a rename leaves. Kept in memory only; nothing is saved.
 */
export interface RenameSuggestion {
  /** Key of the account that disappeared. */
  from: string;
  /** Key of the new username. */
  to: string;
  /** Actions planned (or marked done) on the old account; the import cleared them because its follows were gone. */
  plans: ActionType[];
}

/** The follow dates that identify an account across a rename; null when a date is unknown (no match then). */
function signature(following: number | null | undefined, followedBy: number | null | undefined): string | null {
  if (following === null || followedBy === null || followedBy === undefined) return null;
  return `${following ?? "-"}:${followedBy}`;
}

/** Signature → account key, for signatures seen exactly once; one shared by two accounts is ambiguous and dropped. */
function unique(entries: readonly (readonly [key: string, signature: string | null])[]): Map<string, string> {
  const bySignature = new Map<string, string | null>(); // null = seen more than once
  for (const [key, sig] of entries) {
    if (sig !== null) bySignature.set(sig, bySignature.has(sig) ? null : key);
  }
  const result = new Map<string, string>();
  for (const [sig, key] of bySignature) if (key !== null) result.set(sig, key);
  return result;
}

/**
 * Likely renames in a fresh export, read before the follows are updated (`accounts` still holds
 * the previous ones). Old side: accounts that followed you and are gone from the export entirely.
 * New side: usernames not seen before. Matched when both have the same follower date and, if you
 * followed them, the same following date, and each date occurs on exactly one account of its side.
 */
export function findRenames(
  accounts: Readonly<Record<string, ReadonlyAccount>>,
  following: ReadonlyMap<string, ExportEntry>,
  followers: ReadonlyMap<string, ExportEntry>,
): RenameSuggestion[] {
  const gone = unique(Object.entries(accounts)
    .filter(([key, account]) => account.followedBy !== null && !followers.has(key) && !following.has(key))
    .map(([key, account]) => [key, signature(account.following?.since, account.followedBy?.since)] as const));
  const appeared = unique([...followers]
    .filter(([key]) => !Object.hasOwn(accounts, key))
    .map(([key, entry]) => [key, signature(following.get(key)?.since, entry.since)] as const));

  const renames: RenameSuggestion[] = [];
  for (const [sig, from] of gone) {
    const to = appeared.get(sig);
    const old = accounts[from];
    if (to === undefined || !old) continue;
    renames.push({ from, to, plans: Object.values(ACTION_TYPES).filter(type => planOf(old, type) !== undefined) });
  }
  return renames;
}

/**
 * WRITE (to `target`): moves the old account's review work onto its new name. Tags are combined,
 * notes kept one per line, reviewed if either was. Old plans come back as planned where that follow
 * exists on the new name. Unavailable is not moved: the account clearly still exists.
 */
export function mergeRenamed(target: Account, old: ReadonlyAccount, plans: readonly ActionType[]): void {
  const review = target.review;
  for (const tag of old.review.tags) if (!review.tags.includes(tag)) review.tags.push(tag);
  review.notes = [review.notes, old.review.notes].filter(Boolean).join("\n");
  review.reviewed ||= old.review.reviewed;
  for (const type of plans) {
    if (planOf(target, type) === undefined && followExists(target, type)) setPlan(target, type, PLAN_STATES.PLANNED);
  }
}
