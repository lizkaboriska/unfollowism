import { Button, HStack } from '@chakra-ui/react';

import { PLAN_VIEW_ACTIONS, isFollowChangeView, isPlanView, setView, type ListView } from '../store/filtersSlice.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { selectChangesSince } from '../store/selectors.ts';

import { formatDate } from './dates.ts';
import { CHANGE_TAB_LABELS, PLAN_LABELS } from './labels.ts';
import { CHANGE_VIEWS, TODO_VIEWS, useViewCount } from './viewCounts.ts';

function viewLabel(view: ListView): string {
  if (isFollowChangeView(view)) {
    return CHANGE_TAB_LABELS[view];
  }
  return isPlanView(view) ? PLAN_LABELS[PLAN_VIEW_ACTIONS[view]].todo : '';
}

/** The lists inside the Changes and To do pages, until those pages get their own design. */
export function ViewSwitch() {
  const dispatch = useAppDispatch();
  const view = useAppSelector(s => s.filters.view);
  const since = useAppSelector(selectChangesSince);
  const count = useViewCount();

  const changes = CHANGE_VIEWS.includes(view);
  const views = changes ? CHANGE_VIEWS : TODO_VIEWS;
  const title = changes
    ? since
      ? `Since your last save on ${formatDate(since)}`
      : 'Since you started'
    : 'Accounts you plan to unfollow or remove';

  return (
    <HStack gap="2" wrap="wrap">
      {views.map(v => (
        <Button
          key={v}
          size="sm"
          variant={v === view ? 'solid' : 'outline'}
          aria-pressed={v === view}
          // An empty list can't be opened, unless it's the one being shown (it emptied while working through it).
          disabled={count(v) === 0 && v !== view}
          title={title}
          onClick={() => dispatch(setView(v))}
        >
          {viewLabel(v)} ({count(v)})
        </Button>
      ))}
    </HStack>
  );
}
