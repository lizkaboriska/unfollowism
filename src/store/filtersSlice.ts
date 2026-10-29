import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  ACTION_TYPES,
  FOLLOW_CHANGES,
  REVIEW_SCOPES,
  REVIEW_STATUSES,
  TAG_FILTER_KINDS,
  type ActionType,
  type FollowChange,
  type ReviewScope,
  type ReviewStatusFilter,
  type TagFilter,
  type ValueOf,
} from '../core/index.ts';

import { renameTag, resetScope } from './masterSlice.ts';

/** Which list the main view shows: the review queue, a change since the last save, or a list of planned actions. */
export const LIST_VIEWS = {
  REVIEW: 'review',
  NEW_FOLLOWS: FOLLOW_CHANGES.NEW_FOLLOWS,
  UNFOLLOWED: FOLLOW_CHANGES.UNFOLLOWED,
  NEW_FOLLOWERS: FOLLOW_CHANGES.NEW_FOLLOWERS,
  LOST_FOLLOWERS: FOLLOW_CHANGES.LOST_FOLLOWERS,
  TO_UNFOLLOW: 'toUnfollow',
  TO_REMOVE: 'toRemove',
} as const;
export type ListView = ValueOf<typeof LIST_VIEWS>;

/**
 * The To do lists, and the action each one lists. Status doesn't apply there: planning an action marks the account
 * reviewed.
 */
export const PLAN_VIEW_ACTIONS = {
  [LIST_VIEWS.TO_UNFOLLOW]: ACTION_TYPES.UNFOLLOW,
  [LIST_VIEWS.TO_REMOVE]: ACTION_TYPES.REMOVE_FOLLOWER,
} as const satisfies Partial<Record<ListView, ActionType>>;
export type PlanView = keyof typeof PLAN_VIEW_ACTIONS;

/** The To do list of each action (the reverse of PLAN_VIEW_ACTIONS). */
export const ACTION_PLAN_VIEWS = {
  [ACTION_TYPES.UNFOLLOW]: LIST_VIEWS.TO_UNFOLLOW,
  [ACTION_TYPES.REMOVE_FOLLOWER]: LIST_VIEWS.TO_REMOVE,
} as const satisfies Record<ActionType, PlanView>;

export function isPlanView(view: ListView): view is PlanView {
  return Object.hasOwn(PLAN_VIEW_ACTIONS, view);
}

const FOLLOW_CHANGE_VALUES: readonly string[] = Object.values(FOLLOW_CHANGES);
export function isFollowChangeView(view: ListView): view is FollowChange {
  return FOLLOW_CHANGE_VALUES.includes(view);
}

export interface FiltersState {
  scope: ReviewScope;
  reviewStatus: ReviewStatusFilter;
  tag: TagFilter;
  query: string;
  /** Only REVIEW uses `scope`; status applies everywhere except the To do lists; tag and search apply to every view. */
  view: ListView;
}

const initialState: FiltersState = {
  scope: REVIEW_SCOPES.FOLLOWING,
  reviewStatus: REVIEW_STATUSES.ALL,
  tag: { kind: TAG_FILTER_KINDS.ALL },
  query: '',
  view: LIST_VIEWS.REVIEW,
};

export const filtersSlice = createSlice({
  name: 'filters',
  initialState,
  reducers: {
    setScope(state, { payload }: PayloadAction<ReviewScope>) {
      state.scope = payload;
    },
    setReviewStatus(state, { payload }: PayloadAction<ReviewStatusFilter>) {
      state.reviewStatus = payload;
    },
    setTagFilter(state, { payload }: PayloadAction<TagFilter>) {
      state.tag = payload;
    },
    setQuery(state, { payload }: PayloadAction<string>) {
      state.query = payload;
    },
    setView(state, { payload }: PayloadAction<ListView>) {
      state.view = payload;
    },
  },
  extraReducers: builder => {
    builder
      // After a reset, show what now needs review.
      .addCase(resetScope, state => {
        state.reviewStatus = REVIEW_STATUSES.NEEDS_REVIEW;
      })
      // The filter follows a renamed tag. A tag that no longer exists is handled by tagFilterCleanup.ts.
      .addCase(renameTag, (state, { payload }) => {
        if (state.tag.kind === TAG_FILTER_KINDS.TAG && state.tag.tag === payload.from) {
          state.tag = { kind: TAG_FILTER_KINDS.TAG, tag: payload.to };
        }
      });
  },
});

export const { setScope, setReviewStatus, setTagFilter, setQuery, setView } = filtersSlice.actions;
