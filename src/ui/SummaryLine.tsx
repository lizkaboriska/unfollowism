import { Text } from '@chakra-ui/react';

import { PLAN_STATES } from '../core/index.ts';
import { LIST_VIEWS, PLAN_VIEW_ACTIONS, isFollowChangeView } from '../store/filtersSlice.ts';
import { useAppSelector } from '../store/hooks.ts';
import { selectListKeys } from '../store/listSlice.ts';
import { selectChangesSince, selectPlanStats } from '../store/selectors.ts';

import { formatDate } from './dates.ts';
import { CHANGE_SUMMARY_PHRASES, PLAN_LABELS } from './labels.ts';
import { plural } from './statusText.ts';

/** One line describing what a change or To do tab shows (Review shows its count in the list controls). */
export function SummaryLine() {
  const filters = useAppSelector(s => s.filters);
  const shown = useAppSelector(selectListKeys).length;
  const plans = useAppSelector(selectPlanStats);
  const since = useAppSelector(selectChangesSince);
  const { view } = filters;

  if (view === LIST_VIEWS.REVIEW) {
    return null;
  }
  let text: string;
  if (isFollowChangeView(view)) {
    const period = since ? `since your last save (${formatDate(since)})` : 'since you started';
    text = `${plural(shown, 'account')} ${CHANGE_SUMMARY_PHRASES[view]} ${period}`;
  } else {
    const type = PLAN_VIEW_ACTIONS[view];
    const done = plans[PLAN_STATES.DONE][type];
    const doneText = done ? ` · ${done} done, waiting for the next import` : '';
    text = `${plans[PLAN_STATES.PLANNED][type]} ${PLAN_LABELS[type].summary}${doneText}`;
  }
  return <Text color="fg.muted">{text}</Text>;
}
