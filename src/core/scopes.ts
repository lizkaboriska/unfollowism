import {
  RELATIONSHIPS,
  REVIEW_SCOPES,
  REVIEW_STATUSES,
  TAG_FILTER_KINDS,
  type Account,
  type DeepReadonly,
  type ExportEntry,
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

/** WRITE: records the follows found in the latest export (absent entry = no follow). */
export function setFollows(account: Account, following: ExportEntry | undefined, followedBy: ExportEntry | undefined): void {
  account.following = following ? { since: following.since } : null;
  account.followedBy = followedBy ? { since: followedBy.since } : null;
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

/** WRITE: only `reviewed` changes; lastReviewedAt, tags, notes, flags and actions are kept. Returns the count reset. */
export function resetReviewedForScope(source: Pick<Master, "accounts">, { scope, tag = ALL_TAGS }: { scope: ReviewScope; tag?: TagFilter }): number {
  const targets = reviewScopeAccounts(source, { scope, tag, reviewStatus: REVIEW_STATUSES.REVIEWED });
  for (const account of targets) account.review.reviewed = false;
  return targets.length;
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
