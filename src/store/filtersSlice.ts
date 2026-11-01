import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  ACTION_TYPES,
  DecisionFilter,
  REVIEW_SCOPES,
  TAG_FILTER_KINDS,
  type ActionType,
  type ReviewScope,
  type TagFilter,
  type ValueOf,
} from '../core/index.ts';

import { renameTag } from './masterSlice.ts';

/**
 * Which page the main view shows: the review queue, what changed since the last save (its own sections, not a
 * filtered list), or a list of planned actions.
 */
export const LIST_VIEWS = {
  REVIEW: 'review',
  CHANGES: 'changes',
  TO_UNFOLLOW: 'toUnfollow',
  TO_REMOVE: 'toRemove',
} as const;
export type ListView = ValueOf<typeof LIST_VIEWS>;

/** The To do lists, and the action each one lists. The decision filter doesn't apply there: they're all queued. */
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

export interface FiltersState {
  scope: ReviewScope;
  decision: DecisionFilter;
  tag: TagFilter;
  query: string;
  /** Only REVIEW uses `scope`; decision applies except in To do lists; tag and search apply to every view. */
  view: ListView;
}

/** What the Filter sheet sets in one go: the list and the filters that narrow it. */
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

export const { setScope, setDecisionFilter, setTagFilter, setQuery, setView, applyFilters, clearFilters } =
  filtersSlice.actions;
