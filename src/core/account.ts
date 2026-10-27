import type { Account, DeepReadonly } from "./types.ts";

/** A mutable copy of one account (cheap: a handful of small fields). */
export function copyAccount(account: DeepReadonly<Account>): Account {
  const copy: Account = {
    username: account.username,
    review: { ...account.review, tags: [...account.review.tags] },
    current: { ...account.current },
    actions: { pending: [...account.actions.pending], confirmed: [...account.actions.confirmed] },
  };
  if (account.follower_change) copy.follower_change = account.follower_change;
  return copy;
}

/**
 * The working state keeps the imported accounts untouched and the edited ones separately,
 * so an edit never copies all accounts. This reads one account through that overlay.
 */
export function accountOf<A extends DeepReadonly<Account>>(
  base: Readonly<Record<string, A>>,
  changed: Readonly<Record<string, A>>,
  key: string,
): A | undefined {
  return Object.hasOwn(changed, key) ? changed[key] : base[key];
}
