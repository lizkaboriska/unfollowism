import { Text } from '@chakra-ui/react';
import { PLAN_STATES } from '../core/index.ts';
import { LIST_VIEWS, PLAN_VIEW_ACTIONS, isFollowChangeView } from '../store/filtersSlice.ts';
import { useAppSelector } from '../store/hooks.ts';
import { selectListKeys } from '../store/listSlice.ts';
import { selectChangesSince, selectPlanStats, selectScopeStats } from '../store/selectors.ts';
import { formatDate } from './dates.ts';
import { CHANGE_SUMMARY_PHRASES, PLAN_LABELS, scopeDescription } from './labels.ts';
import { plural } from './statusText.ts';

/** One line describing what the current tab shows. */
export function SummaryLine() {
  const filters = useAppSelector(s => s.filters);
  const shown = useAppSelector(selectListKeys).length;
  const scopeStats = useAppSelector(selectScopeStats);
  const plans = useAppSelector(selectPlanStats);
  const since = useAppSelector(selectChangesSince);
  const { view } = filters;

  let text: string;
  if (view === LIST_VIEWS.REVIEW) {
    const scope = scopeDescription(filters.scope, filters.tag);
    text = `${scopeStats.needsReview} need review · ${scopeStats.reviewed} reviewed · ${scopeStats.total} in ${scope}`;
  } else if (isFollowChangeView(view)) {
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
