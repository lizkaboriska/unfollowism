import { useCallback } from 'react';

import { selectPlanStats } from '@/entities/master';
import { PLAN_VIEW_ACTIONS, isPlanView, type ListView } from '@/entities/master';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

/** How many accounts a To do list has (0 for other views). */
export function useTodoCount(): (view: ListView) => number {
  const planned = useAppSelector(selectPlanStats).planned;
  return useCallback((view: ListView) => (isPlanView(view) ? planned[PLAN_VIEW_ACTIONS[view]] : 0), [planned]);
}
