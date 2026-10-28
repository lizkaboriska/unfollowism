import {
  FOLLOW_CHANGES,
  RELATIONSHIPS,
  REVIEW_SCOPES,
  REVIEW_STATUSES,
  TAG_FILTER_KINDS,
  type Account,
  type DeepReadonly,
  type ExportEntry,
  type Follow,
  type FollowChange,
  type Master,
  type ReadonlyAccount,
  type Relationship,
  type ReviewScope,
  type ReviewStatusFilter,
  type TagFilter,
} from "./types.ts";
import { usernameKey } from "./util.ts";

const ALL_TAGS: TagFilter = { kind: TAG_FILTER_KINDS.ALL };

export function relationshipOf(account: ReadonlyAccount): Relationship {
  if (account.following && account.followedBy) return RELATIONSHIPS.MUTUAL;
  if (account.following) return RELATIONSHIPS.NOT_FOLLOWING_BACK;
  if (account.followedBy) return RELATIONSHIPS.FOLLOWS_YOU_ONLY;
  return RELATIONSHIPS.NEITHER;
}

/**
 * WRITE: records the follows found in the latest export (absent entry = no follow).
 * A follow that appears or disappears is dated with this import (`seenAt`); the opposite change clears that date.
 * Appearing follows are dated only with `datesNew`: without a saved master every follow counts as new anyway.
 */
export function setFollows(
  account: Account,
  following: ExportEntry | undefined,
  followedBy: ExportEntry | undefined,
  seenAt: string,
  datesNew: boolean,
): void {
  if (datesNew && !account.following && following) account.followedSeenAt = seenAt;
  if (!following) delete account.followedSeenAt;
  if (account.following && !following) account.unfollowedSeenAt = seenAt;
  if (following) delete account.unfollowedSeenAt;
  if (datesNew && !account.followedBy && followedBy) account.followedMeSeenAt = seenAt;
  if (!followedBy) delete account.followedMeSeenAt;
  if (account.followedBy && !followedBy) account.unfollowedMeSeenAt = seenAt;
  if (followedBy) delete account.unfollowedMeSeenAt;
  account.following = following ? { since: following.since } : null;
  account.followedBy = followedBy ? { since: followedBy.since } : null;
}

/** A follow that started after `since` (Instagram's date, in seconds). Unknown start dates count as new so they get looked at. */
function followedAfter(follow: DeepReadonly<Follow> | null, since: number): boolean {
  return follow !== null && (follow.since === null || follow.since > since);
}

/**
 * Whether the account belongs to a change list. `since` is when the imported master was
 * saved; null (no saved master yet) means everything counts. A lost follower with an open
 * rename suggestion stays in Lost followers until it is decided, however long ago it left.
 */
export function followChangeMatches(account: ReadonlyAccount, change: FollowChange, since: string | null): boolean {
  const sinceMs = since === null ? Number.NEGATIVE_INFINITY : Date.parse(since);
  const after = (seenAt: string | undefined) => seenAt !== undefined && Date.parse(seenAt) > sinceMs;
  switch (change) {
    case FOLLOW_CHANGES.NEW_FOLLOWS: return after(account.followedSeenAt) || followedAfter(account.following, sinceMs / 1000);
    case FOLLOW_CHANGES.NEW_FOLLOWERS: return after(account.followedMeSeenAt) || followedAfter(account.followedBy, sinceMs / 1000);
    case FOLLOW_CHANGES.UNFOLLOWED: return after(account.unfollowedSeenAt);
    case FOLLOW_CHANGES.LOST_FOLLOWERS: return after(account.unfollowedMeSeenAt) || account.renameSuggestion !== undefined;
  }
}

export type FollowChangeCounts = Record<FollowChange, number>;

export function followChangeCounts(source: DeepReadonly<Pick<Master, "accounts">>, since: string | null): FollowChangeCounts {
  const counts: FollowChangeCounts = {
    [FOLLOW_CHANGES.NEW_FOLLOWS]: 0,
    [FOLLOW_CHANGES.UNFOLLOWED]: 0,
    [FOLLOW_CHANGES.NEW_FOLLOWERS]: 0,
    [FOLLOW_CHANGES.LOST_FOLLOWERS]: 0,
  };
  for (const account of Object.values(source.accounts)) {
    for (const change of Object.values(FOLLOW_CHANGES)) if (followChangeMatches(account, change, since)) counts[change] += 1;
  }
  return counts;
}

export function scopeMatches(account: ReadonlyAccount, scope: ReviewScope): boolean {
  switch (scope) {
    case REVIEW_SCOPES.FOLLOWING: return account.following !== null;
    case REVIEW_SCOPES.FOLLOWERS: return account.followedBy !== null;
    case REVIEW_SCOPES.MUTUAL: return relationshipOf(account) === RELATIONSHIPS.MUTUAL;
    case REVIEW_SCOPES.NOT_FOLLOWING_BACK: return relationshipOf(account) === RELATIONSHIPS.NOT_FOLLOWING_BACK;
    case REVIEW_SCOPES.FOLLOWS_YOU_ONLY: return relationshipOf(account) === RELATIONSHIPS.FOLLOWS_YOU_ONLY;
    case REVIEW_SCOPES.ALL_CURRENT: return account.following !== null || account.followedBy !== null;
    case REVIEW_SCOPES.ALL_ACCOUNTS: return true;
  }
}

export function tagMatches(account: ReadonlyAccount, tag: TagFilter): boolean {
  switch (tag.kind) {
    case TAG_FILTER_KINDS.ALL: return true;
    case TAG_FILTER_KINDS.UNTAGGED: return account.review.tags.length === 0;
    case TAG_FILTER_KINDS.TAG: return account.review.tags.includes(tag.tag);
  }
}

export function reviewStatusMatches(account: ReadonlyAccount, status: ReviewStatusFilter): boolean {
  switch (status) {
    case REVIEW_STATUSES.ALL: return true;
    case REVIEW_STATUSES.REVIEWED: return account.review.reviewed;
    case REVIEW_STATUSES.NEEDS_REVIEW: return !account.review.reviewed;
  }
}

export function queryMatches(account: ReadonlyAccount, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || usernameKey(account.username).includes(q);
}

export interface ScopeQuery {
  scope: ReviewScope;
  tag?: TagFilter;
  reviewStatus?: ReviewStatusFilter;
  query?: string;
}

/** Generic so it returns mutable accounts when given mutable ones (reducers) and readonly ones otherwise. */
export function reviewScopeAccounts<A extends ReadonlyAccount>(
  source: { readonly accounts: Readonly<Record<string, A>> },
  { scope, tag = ALL_TAGS, reviewStatus = REVIEW_STATUSES.ALL, query = "" }: ScopeQuery,
): A[] {
  return Object.values(source.accounts).filter(account =>
    scopeMatches(account, scope) &&
    tagMatches(account, tag) &&
    reviewStatusMatches(account, reviewStatus) &&
    queryMatches(account, query),
  );
}

/**
 * Whether Reset scope un-reviews this account: reviewed, in the scope and matching the tag.
 * Search and the review-status filter don't apply. The reset changes only `reviewed`.
 */
export function inResetScope(account: ReadonlyAccount, { scope, tag }: { scope: ReviewScope; tag: TagFilter }): boolean {
  return account.review.reviewed && scopeMatches(account, scope) && tagMatches(account, tag);
}

export interface RelationshipStats {
  following: number;
  followers: number;
  mutual: number;
  notFollowingBack: number;
  followsYouOnly: number;
  currentAccounts: number;
}

export function relationshipStats(source: DeepReadonly<Pick<Master, "accounts">>): RelationshipStats {
  const stats: RelationshipStats = { following: 0, followers: 0, mutual: 0, notFollowingBack: 0, followsYouOnly: 0, currentAccounts: 0 };
  for (const account of Object.values(source.accounts)) {
    if (account.following) stats.following += 1;
    if (account.followedBy) stats.followers += 1;
    if (account.following || account.followedBy) stats.currentAccounts += 1;
    switch (relationshipOf(account)) {
      case RELATIONSHIPS.MUTUAL: stats.mutual += 1; break;
      case RELATIONSHIPS.NOT_FOLLOWING_BACK: stats.notFollowingBack += 1; break;
      case RELATIONSHIPS.FOLLOWS_YOU_ONLY: stats.followsYouOnly += 1; break;
      case RELATIONSHIPS.NEITHER: break;
    }
  }
  return stats;
}

export interface ScopeStats {
  total: number;
  reviewed: number;
  needsReview: number;
  unavailable: number;
}

export function reviewScopeStats(source: DeepReadonly<Pick<Master, "accounts">>, { scope, tag = ALL_TAGS }: { scope: ReviewScope; tag?: TagFilter }): ScopeStats {
  const scoped = reviewScopeAccounts(source, { scope, tag });
  const reviewed = scoped.filter(a => a.review.reviewed).length;
  return {
    total: scoped.length,
    reviewed,
    needsReview: scoped.length - reviewed,
    unavailable: scoped.filter(a => a.review.unavailable).length,
  };
}
