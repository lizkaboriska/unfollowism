import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  DecisionFilter,
  REVIEW_SCOPES,
  TAG_FILTER_KINDS,
  type ReviewScope,
  type TagFilter,
  LIST_VIEWS,
  type ListView,
} from '@/entities/master';
import { renameTag } from '@/entities/master';

export interface FiltersState {
  scope: ReviewScope;
  decision: DecisionFilter;
  tag: TagFilter;
  query: string;
  /** Only REVIEW uses scope, decision, tag and search; they're kept while another page is open. */
  view: ListView;
}

/** What the Filter popup sets in one go: the list and the filters that narrow it. */
export type FilterChoice = Pick<FiltersState, 'scope' | 'tag' | 'decision'>;

/** Tag and decision when nothing narrows the list. The list (scope) is never "cleared": something is always shown. */
export const NO_FILTERS = {
  tag: { kind: TAG_FILTER_KINDS.ALL },
  decision: DecisionFilter.ANY,
} as const satisfies Pick<FiltersState, 'tag' | 'decision'>;

const initialState: FiltersState = {
  scope: REVIEW_SCOPES.FOLLOWING,
  ...NO_FILTERS,
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
    setDecisionFilter(state, { payload }: PayloadAction<DecisionFilter>) {
      state.decision = payload;
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
    applyFilters(state, { payload }: PayloadAction<FilterChoice>) {
      state.scope = payload.scope;
      state.tag = payload.tag;
      state.decision = payload.decision;
    },
    /** The page and filters a URL asked for, after a reload. */
    showUrlFilters(_state, { payload }: PayloadAction<FiltersState>) {
      return payload;
    },
    clearFilters(state) {
      state.tag = NO_FILTERS.tag;
      state.decision = NO_FILTERS.decision;
    },
  },
  extraReducers: builder => {
    builder
      // The filter follows a renamed tag. A tag that no longer exists is handled by tagFilterCleanup.ts.
      .addCase(renameTag, (state, { payload }) => {
        if (state.tag.kind === TAG_FILTER_KINDS.TAG && state.tag.tag === payload.from) {
          state.tag = { kind: TAG_FILTER_KINDS.TAG, tag: payload.to };
        }
      });
  },
});

export const {
  setScope,
  setDecisionFilter,
  setTagFilter,
  setQuery,
  setView,
  applyFilters,
  clearFilters,
  showUrlFilters,
} = filtersSlice.actions;
