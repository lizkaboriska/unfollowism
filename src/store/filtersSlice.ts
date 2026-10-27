import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { FollowerChange, Master, ReviewScope, ReviewStatusFilter, TagFilter } from "../core/index.ts";
import { resetScope } from "./masterSlice.ts";
import { importPrepared, restoreTab } from "./thunks.ts";

export const CHANGE_VIEWS = ["current", "new_followers", "lost_followers"] as const;
export type ChangeView = (typeof CHANGE_VIEWS)[number];

/** Which account marker each change tab lists. */
export const CHANGE_VIEW_MARKER = { new_followers: "new", lost_followers: "lost" } as const satisfies Record<Exclude<ChangeView, "current">, FollowerChange>;

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
        if (payload) dropUnknownTag(state, payload.base);
      });
  },
});

export const { setScope, setReviewStatus, setTagFilter, setQuery, setChangeView } = filtersSlice.actions;
