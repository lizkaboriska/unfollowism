import { createDict } from '@/shared/lib/createDict.ts';
import type { DeepReadonly } from '@/shared/lib/deepReadonly.ts';

import type { Account, Master, ReadonlyAccount } from './types.ts';

/**
 * Tags have no list of their own: a tag exists while at least one account has it.
 * Counts are kept per tag name, so the list and its numbers come from one pass.
 */
export type TagCounts = Record<string, number>;

/** WRITE (to `counts`): adds (sign 1) or removes (sign -1) one account's tags. */
export function countTags(counts: TagCounts, account: ReadonlyAccount, sign: 1 | -1): void {
  for (const tag of account.review.tags) {
    counts[tag] = (counts[tag] ?? 0) + sign;
  }
}

export function tagCounts(source: DeepReadonly<Pick<Master, 'accounts'>>): TagCounts {
  const counts = createDict<number>();
  for (const account of Object.values(source.accounts)) {
    countTags(counts, account, 1);
  }
  return counts;
}

/** Tags in use, alphabetical. */
export function tagsInUse(counts: Readonly<TagCounts>): string[] {
  return Object.keys(counts)
    .filter(tag => (counts[tag] ?? 0) > 0)
    .sort((a, b) => a.localeCompare(b));
}

/** The existing tag with this name in any letter case, so "Artist" reuses "artist". Undefined if none. */
export function findTag(tags: readonly string[], name: string): string | undefined {
  const wanted = name.trim().toLowerCase();
  return tags.find(tag => tag.toLowerCase() === wanted);
}

/** WRITE: renames a tag on one account; if the account already has `to`, the two merge. */
export function renameTagOn(account: Account, from: string, to: string): void {
  const tags = account.review.tags;
  const index = tags.indexOf(from);
  if (index === -1) {
    return;
  }
  if (tags.includes(to)) {
    tags.splice(index, 1);
  } else {
    tags[index] = to;
  }
}

/** WRITE: removes a tag from one account. */
export function removeTagFrom(account: Account, tag: string): void {
  const index = account.review.tags.indexOf(tag);
  if (index !== -1) {
    account.review.tags.splice(index, 1);
  }
}
