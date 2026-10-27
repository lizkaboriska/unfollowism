import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { Master, ReviewScope, ReviewStatusFilter, TagFilter } from "../core/index.ts";
import { resetScope } from "./masterSlice.ts";
import { importPrepared, restoreTab } from "./thunks.ts";

export const CHANGE_VIEWS = ["current", "followed_since", "unfollowed_since", "new_followers", "new_unfollowers"] as const;
export type ChangeView = (typeof CHANGE_VIEWS)[number];

export interface FiltersState {
  scope: ReviewScope;
  reviewStatus: ReviewStatusFilter;
  tag: TagFilter;
  query: string;
  /** "current" = review queue; the others list the latest snapshot's change set. */
  changeView: ChangeView;
}

const initialState: FiltersState = {
  scope: "following",
  reviewStatus: "all",
  tag: { kind: "all" },
  query: "",
  changeView: "current",
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
        if (payload) dropUnknownTag(state, payload.master);
      });
  },
});

export const { setScope, setReviewStatus, setTagFilter, setQuery, setChangeView } = filtersSlice.actions;
