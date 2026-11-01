import {
  ACTION_TYPES,
  DecisionFilter,
  FOLLOW_CHANGES,
  PLAN_STATES,
  RELATIONSHIPS,
  REVIEW_SCOPES,
  TAG_FILTER_KINDS,
  relationshipOf,
  type ActionType,
  type FollowChange,
  type PlanState,
  type ReadonlyAccount,
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

/** The relationship under a name on a card or row; a past account says it's not in this export. */
export function relationshipNote(account: ReadonlyAccount): string {
  const relationship = relationshipOf(account);
  return relationship === RELATIONSHIPS.NEITHER ? RELATIONSHIP_NOTES[relationship] : RELATIONSHIP_LABELS[relationship];
}

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

/** Section headings on the Changes page. */
export const CHANGE_SECTION_TITLES: Record<FollowChange, string> = {
  [FOLLOW_CHANGES.NEW_FOLLOWERS]: 'New followers',
  [FOLLOW_CHANGES.LOST_FOLLOWERS]: 'No longer follow you',
  [FOLLOW_CHANGES.NEW_FOLLOWS]: 'You started following',
  [FOLLOW_CHANGES.UNFOLLOWED]: 'You stopped following',
};

/** Row badge on Changes for a plan the import found done: why they're in the list. */
export const COMPLETED_PLAN_BADGES: Record<ActionType, string> = {
  [ACTION_TYPES.UNFOLLOW]: 'You unfollowed',
  [ACTION_TYPES.REMOVE_FOLLOWER]: 'You removed',
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

/** A To do tab per action: its label, what it says when empty, and when everything in it is done. */
export const TODO_LABELS: Record<ActionType, { tab: string; empty: string; allDone: string }> = {
  [ACTION_TYPES.UNFOLLOW]: { tab: 'Unfollow', empty: 'No unfollows queued.', allDone: 'All unfollows done' },
  [ACTION_TYPES.REMOVE_FOLLOWER]: {
    tab: 'Remove follower',
    empty: 'No removals queued.',
    allDone: 'All removals done',
  },
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
