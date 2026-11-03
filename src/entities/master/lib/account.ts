import type { DeepReadonly } from '@/shared/lib/deepReadonly.ts';

import { createReview } from './review.ts';
import { DecisionKind, type Account, type Decision, type ReadonlyAccount } from './types.ts';

/** A new account with no follows, decision or review yet. */
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
  if (account.decision) {
    copy.decision = copyDecision(account.decision);
  }
  if (account.followedSeenAt) {
    copy.followedSeenAt = account.followedSeenAt;
  }
  if (account.followedMeSeenAt) {
    copy.followedMeSeenAt = account.followedMeSeenAt;
  }
  if (account.unfollowedSeenAt) {
    copy.unfollowedSeenAt = account.unfollowedSeenAt;
  }
  if (account.unfollowedMeSeenAt) {
    copy.unfollowedMeSeenAt = account.unfollowedMeSeenAt;
  }
  if (account.renameSuggestion) {
    copy.renameSuggestion = { to: account.renameSuggestion.to, plans: [...account.renameSuggestion.plans] };
  }
  return copy;
}

/**
 * Accounts edited since the import, by key. null = removed since the import (the old name of a
 * confirmed rename): the imported account then no longer exists.
 */
export type ChangedAccounts<A extends ReadonlyAccount = Account> = Record<string, A | null>;

/**
 * The working state keeps the imported accounts untouched and the edited ones separately,
 * so an edit never copies all accounts. This reads one account through that overlay.
 * Undefined when there is no such account, or it was removed.
 */
export function accountOf<A extends ReadonlyAccount>(
  base: Readonly<Record<string, A>>,
  changed: Readonly<ChangedAccounts<A>>,
  key: string,
): A | undefined {
  return Object.hasOwn(changed, key) ? (changed[key] ?? undefined) : base[key];
}

/** A mutable copy of a decision. */
export function copyDecision(decision: DeepReadonly<Decision>): Decision {
  return decision.kind === DecisionKind.KEPT
    ? { kind: DecisionKind.KEPT }
    : { kind: decision.kind, plans: { ...decision.plans } };
}
