import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import {
  FOLLOW_CHANGES,
  REVIEW_SCOPES,
  REVIEW_STATUSES,
  TAG_FILTER_KINDS,
  type FollowChange,
  type Master,
  type ReviewScope,
  type ReviewStatusFilter,
  type TagFilter,
  type ValueOf,
} from "../core/index.ts";
import { resetScope } from "./masterSlice.ts";
import { importPrepared, restoreTab } from "./thunks.ts";

/** Which list the main view shows: the review queue, a change since the last save, or a list of planned actions. */
export const LIST_VIEWS = {
  REVIEW: "review",
  NEW_FOLLOWS: FOLLOW_CHANGES.NEW_FOLLOWS,
  UNFOLLOWED: FOLLOW_CHANGES.UNFOLLOWED,
  NEW_FOLLOWERS: FOLLOW_CHANGES.NEW_FOLLOWERS,
  LOST_FOLLOWERS: FOLLOW_CHANGES.LOST_FOLLOWERS,
  TO_UNFOLLOW: "toUnfollow",
  TO_REMOVE: "toRemove",
} as const;
export type ListView = ValueOf<typeof LIST_VIEWS>;

const FOLLOW_CHANGE_VALUES: readonly string[] = Object.values(FOLLOW_CHANGES);
export function isFollowChangeView(view: ListView): view is FollowChange {
  return FOLLOW_CHANGE_VALUES.includes(view);
}

export interface FiltersState {
  scope: ReviewScope;
  reviewStatus: ReviewStatusFilter;
  tag: TagFilter;
  query: string;
  /** Only REVIEW uses `scope`; status, tag and search apply to every view. */
  view: ListView;
}

const initialState: FiltersState = {
  scope: REVIEW_SCOPES.FOLLOWING,
  reviewStatus: REVIEW_STATUSES.ALL,
  tag: { kind: TAG_FILTER_KINDS.ALL },
  query: "",
  view: LIST_VIEWS.REVIEW,
};

function dropUnknownTag(state: FiltersState, master: Master): void {
  if (state.tag.kind === TAG_FILTER_KINDS.TAG && !master.tagOptions.includes(state.tag.tag)) state.tag = { kind: TAG_FILTER_KINDS.ALL };
}

export const filtersSlice = createSlice({
  name: "filters",
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
      .addCase(importPrepared.fulfilled, (state, { payload }) => {
        dropUnknownTag(state, payload.master);
      })
      .addCase(restoreTab.fulfilled, (state, { payload }) => {
        if (payload) dropUnknownTag(state, payload.base);
      });
  },
});

export const { setScope, setReviewStatus, setTagFilter, setQuery, setView } = filtersSlice.actions;
