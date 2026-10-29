import {
  ACTION_TYPES,
  FOLLOW_CHANGES,
  RELATIONSHIPS,
  REVIEW_SCOPES,
  REVIEW_STATUSES,
  TAG_FILTER_KINDS,
  type ActionType,
  type FollowChange,
  type Relationship,
  type ReviewScope,
  type ReviewStatusFilter,
  type TagFilter,
} from '../core/index.ts';

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  [RELATIONSHIPS.MUTUAL]: 'Mutual',
  [RELATIONSHIPS.NOT_FOLLOWING_BACK]: 'Not following back',
  [RELATIONSHIPS.FOLLOWS_YOU_ONLY]: 'Follows me only',
  [RELATIONSHIPS.NEITHER]: 'Neither',
};

export const SCOPE_LABELS: Record<ReviewScope, string> = {
  [REVIEW_SCOPES.FOLLOWING]: 'I follow',
  [REVIEW_SCOPES.FOLLOWERS]: 'People who follow me',
  [REVIEW_SCOPES.MUTUAL]: 'Mutual',
  [REVIEW_SCOPES.NOT_FOLLOWING_BACK]: 'Not following back',
  [REVIEW_SCOPES.FOLLOWS_YOU_ONLY]: 'Follows me only',
  [REVIEW_SCOPES.ALL_CURRENT]: 'All current accounts',
  [REVIEW_SCOPES.ALL_ACCOUNTS]: 'All accounts + history',
};

export const STATUS_LABELS: Record<ReviewStatusFilter, string> = {
  [REVIEW_STATUSES.ALL]: 'All',
  [REVIEW_STATUSES.NEEDS_REVIEW]: 'Needs review',
  [REVIEW_STATUSES.REVIEWED]: 'Reviewed',
};

/** Tab names for the change lists. */
export const CHANGE_TAB_LABELS: Record<FollowChange, string> = {
  [FOLLOW_CHANGES.NEW_FOLLOWS]: 'New follows',
  [FOLLOW_CHANGES.UNFOLLOWED]: 'I unfollowed',
  [FOLLOW_CHANGES.NEW_FOLLOWERS]: 'New followers',
  [FOLLOW_CHANGES.LOST_FOLLOWERS]: 'Lost followers',
};

/** Card badges for the same changes. */
export const CHANGE_BADGE_LABELS: Record<FollowChange, string> = {
  [FOLLOW_CHANGES.NEW_FOLLOWS]: 'New follow',
  [FOLLOW_CHANGES.UNFOLLOWED]: 'Unfollowed',
  [FOLLOW_CHANGES.NEW_FOLLOWERS]: 'New follower',
  [FOLLOW_CHANGES.LOST_FOLLOWERS]: 'Lost follower',
};

/** Summary-line wording: "5 accounts <phrase> since your last save". */
export const CHANGE_SUMMARY_PHRASES: Record<FollowChange, string> = {
  [FOLLOW_CHANGES.NEW_FOLLOWS]: 'you followed',
  [FOLLOW_CHANGES.UNFOLLOWED]: 'you unfollowed',
  [FOLLOW_CHANGES.NEW_FOLLOWERS]: 'started following you',
  [FOLLOW_CHANGES.LOST_FOLLOWERS]: 'stopped following you',
};

/** Checkbox and To do switch wording per planned action. */
export const PLAN_LABELS: Record<ActionType, { checkbox: string; todo: string; summary: string }> = {
  [ACTION_TYPES.UNFOLLOW]: { checkbox: 'To unfollow', todo: 'Unfollow', summary: 'to unfollow' },
  [ACTION_TYPES.REMOVE_FOLLOWER]: { checkbox: 'To remove', todo: 'Remove', summary: 'to remove' },
};

/** "I follow · artist": the scope and tag the Review tab (and Reset scope) covers. */
export function scopeDescription(scope: ReviewScope, tag: TagFilter): string {
  if (tag.kind === TAG_FILTER_KINDS.ALL) return SCOPE_LABELS[scope];
  return `${SCOPE_LABELS[scope]} · ${tag.kind === TAG_FILTER_KINDS.UNTAGGED ? 'untagged' : tag.tag}`;
}
