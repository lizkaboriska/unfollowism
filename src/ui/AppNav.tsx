import { Box, Button, Text } from '@chakra-ui/react';

import { selectTodoStartView } from '@/entities/master/model/selectors.ts';
import { LIST_VIEWS, TODO_VIEWS, isPlanView } from '@/entities/master/model/views.ts';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';

import { setView } from '../store/filtersSlice.ts';

import { useChangesTotal, useTodoCount } from './viewCounts.ts';

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
  const todoStartView = useAppSelector(selectTodoStartView);
  const changesTotal = useChangesTotal();

  /** Opens To do on the tab selectTodoStartView picks. On To do it stays where it is. */
  function openTodo() {
    if (!isPlanView(view)) {
      dispatch(setView(todoStartView));
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
