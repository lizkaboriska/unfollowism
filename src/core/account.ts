import { createReview } from "./review.ts";
import type { Account, ReadonlyAccount } from "./types.ts";

/** A new account with no follows, review or plans yet. */
export function createAccount(username: string): Account {
  return { username, following: null, followedBy: null, review: createReview() };
}

/** A mutable copy of one account (cheap: a handful of small fields). */
export function copyAccount(account: ReadonlyAccount): Account {
  const copy: Account = {
    username: account.username,
    following: account.following && { ...account.following },
    followedBy: account.followedBy && { ...account.followedBy },
    review: { ...account.review, tags: [...account.review.tags] },
  };
  if (account.toUnfollow) copy.toUnfollow = account.toUnfollow;
  if (account.toRemove) copy.toRemove = account.toRemove;
  if (account.unfollowedSeenAt) copy.unfollowedSeenAt = account.unfollowedSeenAt;
  if (account.unfollowedMeSeenAt) copy.unfollowedMeSeenAt = account.unfollowedMeSeenAt;
  return copy;
}

/**
 * The working state keeps the imported accounts untouched and the edited ones separately,
 * so an edit never copies all accounts. This reads one account through that overlay.
 */
export function accountOf<A extends ReadonlyAccount>(
  base: Readonly<Record<string, A>>,
  changed: Readonly<Record<string, A>>,
  key: string,
): A | undefined {
  return Object.hasOwn(changed, key) ? changed[key] : base[key];
}
