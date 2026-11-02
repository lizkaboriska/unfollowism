import { useCallback } from 'react';

import { selectChangesSince, selectFollowChangeCounts, selectPlanStats } from '@/entities/master/model/selectors.ts';
import { PLAN_VIEW_ACTIONS, isPlanView, type ListView } from '@/entities/master/model/views.ts';

import { useAppSelector } from '../store/hooks.ts';

/** How many accounts a To do list has (0 for other views). */
export function useTodoCount(): (view: ListView) => number {
  const planned = useAppSelector(selectPlanStats).planned;
  return useCallback((view: ListView) => (isPlanView(view) ? planned[PLAN_VIEW_ACTIONS[view]] : 0), [planned]);
}

/** Everything on the Changes page; 0 without a saved master, when there is nothing to compare with. */
export function useChangesTotal(): number {
  const counts = useAppSelector(selectFollowChangeCounts);
  const since = useAppSelector(selectChangesSince);
  return since === null ? 0 : Object.values(counts).reduce((sum, n) => sum + n, 0);
}
