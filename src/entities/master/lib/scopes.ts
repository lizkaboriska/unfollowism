import type { DeepReadonly } from '@/shared/lib/deepReadonly.ts';

import { isPastAccount } from './decision.ts';
import {
  FOLLOW_CHANGES,
  RELATIONSHIPS,
  REVIEW_SCOPES,
  TAG_FILTER_KINDS,
  type Account,
  type ExportEntry,
  type Follow,
  type FollowChange,
  type Master,
  type ReadonlyAccount,
  type Relationship,
  type ReviewScope,
  type TagFilter,
} from './types.ts';
import { usernameKey } from './util.ts';

export function relationshipOf(account: ReadonlyAccount): Relationship {
  if (account.following && account.followedBy) {
    return RELATIONSHIPS.MUTUAL;
  }
  if (account.following) {
    return RELATIONSHIPS.NOT_FOLLOWING_BACK;
  }
  if (account.followedBy) {
    return RELATIONSHIPS.FOLLOWS_YOU_ONLY;
  }
  return RELATIONSHIPS.NEITHER;
}

/**
 * WRITE: records the follows found in the latest export (absent entry = no follow).
 * A follow that appears (or comes back with a new Instagram date: followed again) or disappears is dated with this
 * import (`seenAt`); the opposite change clears that date. Appearing follows are dated only with `shouldDateNew`: on a
 * first import there is nothing to compare with.
 */
export function setFollows(
  account: Account,
  following: ExportEntry | undefined,
  followedBy: ExportEntry | undefined,
  seenAt: string,
  shouldDateNew: boolean,
): void {
  if (shouldDateNew && following && account.following?.since !== following.since) {
    account.followedSeenAt = seenAt;
  }
  if (!following) {
    delete account.followedSeenAt;
  }
  if (account.following && !following) {
    account.unfollowedSeenAt = seenAt;
  }
  if (following) {
    delete account.unfollowedSeenAt;
  }
  if (shouldDateNew && followedBy && account.followedBy?.since !== followedBy.since) {
    account.followedMeSeenAt = seenAt;
  }
  if (!followedBy) {
    delete account.followedMeSeenAt;
  }
  if (account.followedBy && !followedBy) {
    account.unfollowedMeSeenAt = seenAt;
  }
  if (followedBy) {
    delete account.unfollowedMeSeenAt;
  }
  account.following = following ? { since: following.since } : null;
  account.followedBy = followedBy ? { since: followedBy.since } : null;
}

/**
 * A follow that started after `since` (Instagram's date, in seconds). Unknown start dates count as new so they get
 * looked at.
 */
function followedAfter(follow: DeepReadonly<Follow> | null, since: number): boolean {
  return follow !== null && (follow.since === null || follow.since > since);
}

/**
 * Whether the account belongs to a change list. `since` is when the imported master was
 * saved; null (no saved master yet) means everything counts. Renames are left out by the
 * selectors (renameHiddenKeys), not here.
 */
export function followChangeMatches(account: ReadonlyAccount, change: FollowChange, since: string | null): boolean {
  const sinceMs = since === null ? Number.NEGATIVE_INFINITY : Date.parse(since);
  const after = (seenAt: string | undefined) => seenAt !== undefined && Date.parse(seenAt) > sinceMs;
  switch (change) {
    case FOLLOW_CHANGES.NEW_FOLLOWS:
      return after(account.followedSeenAt) || followedAfter(account.following, sinceMs / 1000);
    case FOLLOW_CHANGES.NEW_FOLLOWERS:
      return after(account.followedMeSeenAt) || followedAfter(account.followedBy, sinceMs / 1000);
    case FOLLOW_CHANGES.UNFOLLOWED:
      return after(account.unfollowedSeenAt);
    case FOLLOW_CHANGES.LOST_FOLLOWERS:
      return after(account.unfollowedMeSeenAt);
  }
}

export type FollowChangeCounts = Record<FollowChange, number>;

export function followChangeCounts(
  source: DeepReadonly<Pick<Master, 'accounts'>>,
  since: string | null,
): FollowChangeCounts {
  const counts: FollowChangeCounts = {
    [FOLLOW_CHANGES.NEW_FOLLOWS]: 0,
    [FOLLOW_CHANGES.UNFOLLOWED]: 0,
    [FOLLOW_CHANGES.NEW_FOLLOWERS]: 0,
    [FOLLOW_CHANGES.LOST_FOLLOWERS]: 0,
  };
  for (const account of Object.values(source.accounts)) {
    for (const change of Object.values(FOLLOW_CHANGES)) {
      if (followChangeMatches(account, change, since)) {
        counts[change] += 1;
      }
    }
  }
  return counts;
}

export function scopeMatches(account: ReadonlyAccount, scope: ReviewScope): boolean {
  switch (scope) {
    case REVIEW_SCOPES.FOLLOWING:
      return account.following !== null;
    case REVIEW_SCOPES.FOLLOWERS:
      return account.followedBy !== null;
    case REVIEW_SCOPES.MUTUAL:
      return relationshipOf(account) === RELATIONSHIPS.MUTUAL;
    case REVIEW_SCOPES.NOT_FOLLOWING_BACK:
      return relationshipOf(account) === RELATIONSHIPS.NOT_FOLLOWING_BACK;
    case REVIEW_SCOPES.FOLLOWS_YOU_ONLY:
      return relationshipOf(account) === RELATIONSHIPS.FOLLOWS_YOU_ONLY;
    case REVIEW_SCOPES.ALL_CURRENT:
      return !isPastAccount(account);
    case REVIEW_SCOPES.ALL_ACCOUNTS:
      return true;
  }
}

export function tagMatches(account: ReadonlyAccount, tag: TagFilter): boolean {
  switch (tag.kind) {
    case TAG_FILTER_KINDS.ALL:
      return true;
    case TAG_FILTER_KINDS.UNTAGGED:
      return account.review.tags.length === 0;
    case TAG_FILTER_KINDS.TAG:
      return account.review.tags.includes(tag.tag);
  }
}

export function queryMatches(account: ReadonlyAccount, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  return !normalizedQuery || usernameKey(account.username).includes(normalizedQuery);
}

export interface RelationshipStats {
  following: number;
  followers: number;
  mutual: number;
  notFollowingBack: number;
  followsYouOnly: number;
  currentAccounts: number;
}

export function relationshipStats(source: DeepReadonly<Pick<Master, 'accounts'>>): RelationshipStats {
  const stats: RelationshipStats = {
    following: 0,
    followers: 0,
    mutual: 0,
    notFollowingBack: 0,
    followsYouOnly: 0,
    currentAccounts: 0,
  };
  for (const account of Object.values(source.accounts)) {
    if (account.following) {
      stats.following += 1;
    }
    if (account.followedBy) {
      stats.followers += 1;
    }
    if (account.following || account.followedBy) {
      stats.currentAccounts += 1;
    }
    switch (relationshipOf(account)) {
      case RELATIONSHIPS.MUTUAL:
        stats.mutual += 1;
        break;
      case RELATIONSHIPS.NOT_FOLLOWING_BACK:
        stats.notFollowingBack += 1;
        break;
      case RELATIONSHIPS.FOLLOWS_YOU_ONLY:
        stats.followsYouOnly += 1;
        break;
      case RELATIONSHIPS.NEITHER:
        break;
    }
  }
  return stats;
}
