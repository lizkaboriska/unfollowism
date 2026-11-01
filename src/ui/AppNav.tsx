import { Box, Button, Text } from '@chakra-ui/react';

import { PLAN_STATES } from '../core/index.ts';
import { LIST_VIEWS, PLAN_VIEW_ACTIONS, isPlanView, setView, type PlanView } from '../store/filtersSlice.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { selectPlanStats } from '../store/selectors.ts';

import { TODO_VIEWS, useChangesTotal, useTodoCount } from './viewCounts.ts';

function NavItem({
  label,
  count = 0,
  active,
  onClick,
}: {
  label: string;
  count?: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      variant={active ? 'solid' : 'plain'}
      aria-current={active ? 'page' : undefined}
      h="full"
      minH={{ md: '12' }}
      gap="1.5"
      justifyContent={{ base: 'center', md: 'flex-start' }}
      px={{ md: '3.5' }}
      textStyle="control"
      borderLeftWidth={{ base: '1px', md: '0' }}
      borderTopWidth={{ base: '0', md: '1px' }}
      borderColor="ink"
      _first={{ borderLeftWidth: '0', borderTopWidth: '0' }}
      onClick={onClick}
    >
      {label}
      {count > 0 && ' '}
      {count > 0 && (
        <Text as="span" textStyle="count" color={active ? 'paper' : 'accent'}>
          {count}
        </Text>
      )}
    </Button>
  );
}

/** Review · Changes · To do: a bottom bar on a phone, a framed list beside the page on desktop. */
export function AppNav() {
  const dispatch = useAppDispatch();
  const view = useAppSelector(s => s.filters.view);
  const todoCount = useTodoCount();
  const planStats = useAppSelector(selectPlanStats);
  const changesTotal = useChangesTotal();

  /**
   * Opens To do on its first tab with work left (Unfollow, then Remove follower), else the first with done plans to
   * look back at, else Unfollow. On To do it stays where it is.
   */
  function openTodo() {
    if (!isPlanView(view)) {
      const hasDone = (v: PlanView) => planStats[PLAN_STATES.DONE][PLAN_VIEW_ACTIONS[v]] > 0;
      dispatch(setView(TODO_VIEWS.find(v => todoCount(v) > 0) ?? TODO_VIEWS.find(hasDone) ?? LIST_VIEWS.TO_UNFOLLOW));
    }
  }

  return (
    <Box
      as="nav"
      aria-label="Main"
      position={{ base: 'fixed', md: 'sticky' }}
      bottom={{ base: '0' }}
      top={{ md: '5' }}
      left={{ base: '0' }}
      right={{ base: '0' }}
      zIndex="docked"
      h={{ base: '64px', md: 'auto' }}
      w={{ md: '48' }}
      flexShrink="0"
      alignSelf={{ md: 'flex-start' }}
      display={{ base: 'grid', md: 'flex' }}
      gridTemplateColumns="repeat(3, minmax(0, 1fr))"
      flexDirection="column"
      bg="paper"
      borderTopWidth={{ base: '1px', md: '0' }}
      borderWidth={{ md: '1px' }}
    >
      <NavItem
        label="Review"
        active={view === LIST_VIEWS.REVIEW}
        onClick={() => dispatch(setView(LIST_VIEWS.REVIEW))}
      />
      <NavItem
        label="Changes"
        count={changesTotal}
        active={view === LIST_VIEWS.CHANGES}
        onClick={() => dispatch(setView(LIST_VIEWS.CHANGES))}
      />
      <NavItem
        label="To do"
        count={TODO_VIEWS.reduce((sum, v) => sum + todoCount(v), 0)}
        active={isPlanView(view)}
        onClick={openTodo}
      />
    </Box>
  );
}
