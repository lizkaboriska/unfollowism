import { Text } from '@chakra-ui/react';

import { PLAN_STATES } from '../core/index.ts';
import { PLAN_VIEW_ACTIONS, isPlanView } from '../store/filtersSlice.ts';
import { useAppSelector } from '../store/hooks.ts';
import { selectPlanStats } from '../store/selectors.ts';

import { PLAN_LABELS } from './labels.ts';

/** One line describing what a To do list shows. */
export function SummaryLine() {
  const view = useAppSelector(s => s.filters.view);
  const plans = useAppSelector(selectPlanStats);
  if (!isPlanView(view)) {
    return null;
  }
  const type = PLAN_VIEW_ACTIONS[view];
  const done = plans[PLAN_STATES.DONE][type];
  const doneText = done ? ` · ${done} done, waiting for the next import` : '';
  return <Text color="fg.muted">{`${plans[PLAN_STATES.PLANNED][type]} ${PLAN_LABELS[type].summary}${doneText}`}</Text>;
}
