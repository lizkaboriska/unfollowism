import { useCallback } from 'react';

import { FOLLOW_CHANGES } from '../core/index.ts';
import {
  ACTION_PLAN_VIEWS,
  PLAN_VIEW_ACTIONS,
  isFollowChangeView,
  isPlanView,
  type ListView,
} from '../store/filtersSlice.ts';
import { useAppSelector } from '../store/hooks.ts';
import { selectFollowChangeCounts, selectPlanStats } from '../store/selectors.ts';

/** The lists of the Changes and To do pages, in display order. */
export const CHANGE_VIEWS: readonly ListView[] = [
  FOLLOW_CHANGES.NEW_FOLLOWS,
  FOLLOW_CHANGES.UNFOLLOWED,
  FOLLOW_CHANGES.NEW_FOLLOWERS,
  FOLLOW_CHANGES.LOST_FOLLOWERS,
];
export const TODO_VIEWS: readonly ListView[] = Object.values(ACTION_PLAN_VIEWS);

/** How many accounts a change or To do list has (Review has no count). */
export function useViewCount(): (view: ListView) => number {
  const changeCounts = useAppSelector(selectFollowChangeCounts);
  const planned = useAppSelector(selectPlanStats).planned;
  return useCallback(
    (view: ListView) => {
      if (isFollowChangeView(view)) {
        return changeCounts[view];
      }
      return isPlanView(view) ? planned[PLAN_VIEW_ACTIONS[view]] : 0;
    },
    [changeCounts, planned],
  );
}
