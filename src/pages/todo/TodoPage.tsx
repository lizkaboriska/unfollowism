import { Box, Heading, Progress, Stack, Text } from '@chakra-ui/react';
import { useMemo, useState } from 'react';

import { PLAN_STATES, totalOf } from '@/entities/master/lib/index.ts';
import { selectPlanStats } from '@/entities/master/model/selectors.ts';
import { PLAN_VIEW_ACTIONS, type PlanView } from '@/entities/master/model/views.ts';
import { TODO_LABELS } from '@/entities/master/ui/labels.ts';
import { selectListKeys } from '@/features/filters';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';
import { AccountList, type ListItems } from '@/widgets/account-list';

import { TodoFinished } from './TodoFinished.tsx';
import { TodoRow } from './TodoRow.tsx';
import { TodoTabs } from './TodoTabs.tsx';

/** Rough height of a queued row before measuring. */
const ESTIMATED_TODO_ROW_HEIGHT = 140;

/** "1 of 4 done" and the bar, over both tabs: every plan, queued or done. */
function TodoProgress({ done, all }: { done: number; all: number }) {
  return (
    <Stack gap="2">
      <Text textStyle="small" color="fg.muted">
        {done} of {all} done
      </Text>
      <Progress.Root value={done} max={all} aria-label="Done">
        <Progress.Track h="2" borderWidth="1px" bg="paper">
          <Progress.Range bg="ink" />
        </Progress.Track>
      </Progress.Root>
    </Stack>
  );
}

/** The open tab's rows; "All unfollows done" above them once nothing in it is left to do. */
function TodoTabList({ view }: { view: PlanView }) {
  const type = PLAN_VIEW_ACTIONS[view];
  const stats = useAppSelector(selectPlanStats);
  const hasList = useAppSelector(selectListKeys).length > 0;
  const items = useMemo(
    (): ListItems => ({
      render: accountKey => <TodoRow accountKey={accountKey} type={type} />,
      estimatedHeight: ESTIMATED_TODO_ROW_HEIGHT,
      empty: <Text color="fg.muted">{TODO_LABELS[type].empty}</Text>,
    }),
    [type],
  );
  const allDone = hasList && stats[PLAN_STATES.PLANNED][type] === 0 && stats[PLAN_STATES.DONE][type] > 0;
  return (
    <Stack gap="3">
      {allDone && <Text textStyle="control">{TODO_LABELS[type].allDone}</Text>}
      <AccountList items={items} />
    </Stack>
  );
}

/**
 * To do: progress, then the Unfollow and Remove follower tabs. With nothing left to do it shows All done (or
 * Nothing queued). Once the tabs are showing they stay until you leave the page, so marking the last row done
 * doesn't swap the page under your finger; coming back then shows All done.
 */
export function TodoPage({ view }: { view: PlanView }) {
  const stats = useAppSelector(selectPlanStats);
  const left = totalOf(stats[PLAN_STATES.PLANNED]);
  const done = totalOf(stats[PLAN_STATES.DONE]);
  const [showTabs, setShowTabs] = useState(left > 0);
  // Work appearing (an Undo, a reset) shows the tabs, and they stay (state set during render, React's pattern).
  if (left > 0 && !showTabs) {
    setShowTabs(true);
  }

  return (
    <Stack gap="5">
      <Stack gap="2">
        <Heading as="h1" textStyle="title">
          To do
        </Heading>
        {left + done > 0 && <TodoProgress done={done} all={left + done} />}
      </Stack>
      {showTabs ? (
        <>
          <Box borderWidth="1px" p="3">
            <Text textStyle="control">You make the changes in Instagram</Text>
            <Text color="fg.muted" lineHeight="1.5">
              Open the profile, make the change there, then mark it done here. Your next import confirms it.
            </Text>
          </Box>
          <TodoTabs view={view}>
            <TodoTabList view={view} />
          </TodoTabs>
        </>
      ) : (
        <TodoFinished
          done={done}
          onViewCompleted={() => {
            setShowTabs(true);
          }}
        />
      )}
    </Stack>
  );
}
