import { Button, HStack } from '@chakra-ui/react';

import { PLAN_VIEW_ACTIONS, setView } from '../store/filtersSlice.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';

import { PLAN_LABELS } from './labels.ts';
import { TODO_VIEWS, useTodoCount } from './viewCounts.ts';

/** The two lists inside the To do page, until it gets its own design. */
export function ViewSwitch() {
  const dispatch = useAppDispatch();
  const view = useAppSelector(s => s.filters.view);
  const count = useTodoCount();

  return (
    <HStack gap="2" wrap="wrap">
      {TODO_VIEWS.map(v => (
        <Button
          key={v}
          size="sm"
          variant={v === view ? 'solid' : 'outline'}
          aria-pressed={v === view}
          // An empty list can't be opened, unless it's the one being shown (it emptied while working through it).
          disabled={count(v) === 0 && v !== view}
          title="Accounts you plan to unfollow or remove"
          onClick={() => dispatch(setView(v))}
        >
          {PLAN_LABELS[PLAN_VIEW_ACTIONS[v]].todo} ({count(v)})
        </Button>
      ))}
    </HStack>
  );
}
