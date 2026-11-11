import { Tabs, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

import { TODO_LABELS } from '@/entities/master';
import { setView, useTodoCount, PLAN_VIEW_ACTIONS, TODO_VIEWS, type PlanView } from '@/features/filters';
import { useAppDispatch } from '@/shared/lib/storeHooks.ts';

/**
 * Unfollow · Remove follower as one framed bar of two cells; the open tab is black. A count is what's still to do
 * in that tab, hidden at 0. Both tabs always show, so the page keeps its shape. The open tab's list is `children`.
 */
export function TodoTabs({ view, children }: { view: PlanView; children: ReactNode }) {
  const dispatch = useAppDispatch();
  const count = useTodoCount();

  return (
    <Tabs.Root
      value={view}
      variant="plain"
      onValueChange={({ value }) => {
        const next = TODO_VIEWS.find(tabView => tabView === value);
        if (next) {
          dispatch(setView(next));
        }
      }}
    >
      <Tabs.List display="grid" gridTemplateColumns="repeat(2, minmax(0, 1fr))" borderWidth="1px" w="full">
        {TODO_VIEWS.map(tabView => {
          const left = count(tabView);
          return (
            <Tabs.Trigger
              key={tabView}
              value={tabView}
              h="11"
              justifyContent="center"
              gap="1.5"
              textStyle="control"
              color="ink"
              _notFirst={{ borderLeftWidth: '1px', borderColor: 'ink' }}
              _selected={{ bg: 'ink', color: 'paper' }}
            >
              {TODO_LABELS[PLAN_VIEW_ACTIONS[tabView]].tab}
              {left > 0 && ' '}
              {left > 0 && (
                <Text as="span" textStyle="count" color={tabView === view ? 'paper' : 'accent'}>
                  {left}
                </Text>
              )}
            </Tabs.Trigger>
          );
        })}
      </Tabs.List>
      <Tabs.Content value={view} pt="3">
        {children}
      </Tabs.Content>
    </Tabs.Root>
  );
}
