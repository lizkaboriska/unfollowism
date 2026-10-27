import type { Account, CurrentRelationship, DeepReadonly, Master, ParsedAccount, ReviewScope, ReviewStatusFilter, TagFilter } from "./types.ts";
import { usernameKey } from "./util.ts";

type ReadonlyAccount = DeepReadonly<Account>;

/** Presence means the relationship exists; only the "since" timestamp is read. */
export type RelationItem = Readonly<Partial<Pick<ParsedAccount, "username" | "timestamp">>> | null | undefined;

export function computeCurrent(followingItem: RelationItem, followerItem: RelationItem): CurrentRelationship {
  const youFollow = !!followingItem;
  const followsYou = !!followerItem;
  return {
    you_follow: youFollow,
    follows_you: followsYou,
    relationship: youFollow && followsYou ? "mutual" : youFollow ? "not_following_back" : followsYou ? "follows_you_only" : "neither",
    following_since_timestamp: followingItem?.timestamp ?? null,
    follower_since_timestamp: followerItem?.timestamp ?? null,
  };
}

/** WRITE */
export function syncCurrentRelationship(account: Account, followingItem: RelationItem, followerItem: RelationItem): CurrentRelationship {
  account.current = computeCurrent(followingItem, followerItem);
  return account.current;
}

export function scopeMatches(account: ReadonlyAccount, scope: ReviewScope): boolean {
  const current = account.current;
  switch (scope) {
    case "following": return current.you_follow;
    case "followers": return current.follows_you;
    case "mutual": return current.relationship === "mutual";
    case "not_following_back": return current.relationship === "not_following_back";
    case "follows_you_only": return current.relationship === "follows_you_only";
    case "all_current": return current.you_follow || current.follows_you;
    case "all_accounts": return true;
  }
}

export function tagMatches(account: ReadonlyAccount, tag: TagFilter): boolean {
  switch (tag.kind) {
    case "all": return true;
    case "untagged": return account.review.tags.length === 0;
    case "tag": return account.review.tags.includes(tag.tag);
  }
}

export function reviewStatusMatches(account: ReadonlyAccount, status: ReviewStatusFilter): boolean {
  switch (status) {
    case "all": return true;
    case "reviewed": return account.review.reviewed;
    case "needs_review": return !account.review.reviewed;
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
  { scope, tag = { kind: "all" }, reviewStatus = "all", query = "" }: ScopeQuery,
): A[] {
  return Object.values(source.accounts).filter(account =>
    scopeMatches(account, scope) &&
    tagMatches(account, tag) &&
    reviewStatusMatches(account, reviewStatus) &&
    queryMatches(account, query),
  );
}

/** WRITE: only `reviewed` changes; last_reviewed_at, tags, notes, flags and actions are kept. Returns the count reset. */
export function resetReviewedForScope(source: Pick<Master, "accounts">, { scope, tag = { kind: "all" } }: { scope: ReviewScope; tag?: TagFilter }): number {
  const targets = reviewScopeAccounts(source, { scope, tag, reviewStatus: "reviewed" });
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
  for (const { current } of Object.values(source.accounts)) {
    if (current.you_follow) stats.following += 1;
    if (current.follows_you) stats.followers += 1;
    if (current.relationship === "mutual") stats.mutual += 1;
    if (current.relationship === "not_following_back") stats.notFollowingBack += 1;
    if (current.relationship === "follows_you_only") stats.followsYouOnly += 1;
    if (current.you_follow || current.follows_you) stats.currentAccounts += 1;
  }
  return stats;
}

export interface ScopeStats {
  total: number;
  reviewed: number;
  needsReview: number;
  unavailable: number;
}

export function reviewScopeStats(source: DeepReadonly<Pick<Master, "accounts">>, { scope, tag = { kind: "all" } }: { scope: ReviewScope; tag?: TagFilter }): ScopeStats {
  const scoped = reviewScopeAccounts(source, { scope, tag });
  const reviewed = scoped.filter(a => a.review.reviewed).length;
  return {
    total: scoped.length,
    reviewed,
    needsReview: scoped.length - reviewed,
    unavailable: scoped.filter(a => a.review.deleted_or_unavailable).length,
  };
}
