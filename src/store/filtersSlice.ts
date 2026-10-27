import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { FOLLOWER_CHANGES, type Master, type ReviewScope, type ReviewStatusFilter, type TagFilter } from "../core/index.ts";
import { resetScope } from "./masterSlice.ts";
import { importPrepared, restoreTab } from "./thunks.ts";

/** "Current review", or the accounts the latest import marked with that follower change. */
export const CHANGE_VIEWS = { CURRENT: "current", NEW_FOLLOWERS: FOLLOWER_CHANGES.NEW, LOST_FOLLOWERS: FOLLOWER_CHANGES.LOST } as const;
export type ChangeView = (typeof CHANGE_VIEWS)[keyof typeof CHANGE_VIEWS];

export interface FiltersState {
  scope: ReviewScope;
  reviewStatus: ReviewStatusFilter;
  tag: TagFilter;
  query: string;
  /** "current" = review queue; the others list who started/stopped following you in the latest import. */
  changeView: ChangeView;
}

const initialState: FiltersState = {
  scope: "following",
  reviewStatus: "all",
  tag: { kind: "all" },
  query: "",
  changeView: CHANGE_VIEWS.CURRENT,
};

function dropUnknownTag(state: FiltersState, master: Master): void {
  if (state.tag.kind === "tag" && !master.tag_options.includes(state.tag.tag)) state.tag = { kind: "all" };
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
    setChangeView(state, { payload }: PayloadAction<ChangeView>) {
      state.changeView = payload;
    },
  },
  extraReducers: builder => {
    builder
      // After a reset, show what now needs review.
      .addCase(resetScope, state => {
        state.reviewStatus = "needs_review";
      })
      .addCase(importPrepared.fulfilled, (state, { payload }) => {
        dropUnknownTag(state, payload.result.master);
      })
      .addCase(restoreTab.fulfilled, (state, { payload }) => {
        if (payload) dropUnknownTag(state, payload.base);
      });
  },
});

export const { setScope, setReviewStatus, setTagFilter, setQuery, setChangeView } = filtersSlice.actions;
