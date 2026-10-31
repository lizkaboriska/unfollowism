import {
  ACTION_TYPES,
  DecisionFilter,
  FOLLOW_CHANGES,
  PLAN_STATES,
  RELATIONSHIPS,
  REVIEW_SCOPES,
  TAG_FILTER_KINDS,
  type ActionType,
  type FollowChange,
  type PlanState,
  type Relationship,
  type ReviewScope,
  type TagFilter,
} from '../core/index.ts';

export const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  [RELATIONSHIPS.MUTUAL]: 'Mutual',
  [RELATIONSHIPS.NOT_FOLLOWING_BACK]: 'Not following back',
  [RELATIONSHIPS.FOLLOWS_YOU_ONLY]: 'Follows you only',
  [RELATIONSHIPS.NEITHER]: 'Neither',
};

/** Under a name in the account sheet: what the relationship means. */
export const RELATIONSHIP_NOTES: Record<Relationship, string> = {
  [RELATIONSHIPS.MUTUAL]: 'Mutual · you follow each other',
  [RELATIONSHIPS.NOT_FOLLOWING_BACK]: 'Not following back · you follow them',
  [RELATIONSHIPS.FOLLOWS_YOU_ONLY]: 'Follows you only · they follow you',
  [RELATIONSHIPS.NEITHER]: 'Not in this export',
};

export const SCOPE_LABELS: Record<ReviewScope, string> = {
  [REVIEW_SCOPES.FOLLOWING]: 'Following',
  [REVIEW_SCOPES.FOLLOWERS]: 'Followers',
  [REVIEW_SCOPES.MUTUAL]: 'Mutual',
  [REVIEW_SCOPES.NOT_FOLLOWING_BACK]: 'Not following back',
  [REVIEW_SCOPES.FOLLOWS_YOU_ONLY]: 'Follows you only',
  [REVIEW_SCOPES.ALL_CURRENT]: 'Everyone now',
  [REVIEW_SCOPES.ALL_ACCOUNTS]: 'Everyone incl. past accounts',
};

export const DECISION_FILTER_LABELS: Record<DecisionFilter, string> = {
  [DecisionFilter.ANY]: 'Any',
  [DecisionFilter.NEEDS_DECISION]: 'Needs a decision',
  [DecisionFilter.KEPT]: 'Kept',
  [DecisionFilter.QUEUED]: 'Queued',
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

/** A queued plan by name: "Unfollow", "Removal". */
const PLAN_NOUNS: Record<ActionType, string> = {
  [ACTION_TYPES.UNFOLLOW]: 'Unfollow',
  [ACTION_TYPES.REMOVE_FOLLOWER]: 'Removal',
};
const PLAN_STATE_WORDS: Record<PlanState, string> = {
  [PLAN_STATES.PLANNED]: 'queued',
  [PLAN_STATES.DONE]: 'done',
};

/** "Unfollow queued", "Removal done". */
export function planText(type: ActionType, state: PlanState): string {
  return `${PLAN_NOUNS[type]} ${PLAN_STATE_WORDS[state]}`;
}

/** The button that queues a plan: "Queue unfollow", "Queue removal". */
export function queueText(type: ActionType): string {
  return `Queue ${PLAN_NOUNS[type].toLowerCase()}`;
}

/** Checkbox and To do switch wording per planned action. */
export const PLAN_LABELS: Record<ActionType, { checkbox: string; todo: string; summary: string }> = {
  [ACTION_TYPES.UNFOLLOW]: { checkbox: 'To unfollow', todo: 'Unfollow', summary: 'to unfollow' },
  [ACTION_TYPES.REMOVE_FOLLOWER]: { checkbox: 'To remove', todo: 'Remove', summary: 'to remove' },
};

/** The tag filter's option and chip label: "Any tag", "No tags" or the tag itself. */
export function tagFilterLabel(tag: TagFilter): string {
  switch (tag.kind) {
    case TAG_FILTER_KINDS.ALL:
      return 'Any tag';
    case TAG_FILTER_KINDS.UNTAGGED:
      return 'No tags';
    case TAG_FILTER_KINDS.TAG:
      return tag.tag;
  }
}
