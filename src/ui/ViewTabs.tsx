import { useState } from "react";
import { Button, HStack, Stack } from "@chakra-ui/react";
import { ACTION_TYPES, FOLLOW_CHANGES, type ActionType, type FollowChange } from "../core/index.ts";
import { ACTION_PLAN_VIEWS, LIST_VIEWS, isPlanView, setView } from "../store/filtersSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { selectChangesSince, selectFollowChangeCounts, selectPlanStats } from "../store/selectors.ts";
import { formatDate } from "./dates.ts";
import { CHANGE_TAB_LABELS, PLAN_LABELS } from "./labels.ts";

/** Change tabs in display order, around the To do tab. */
const BEFORE_TODO: readonly FollowChange[] = [FOLLOW_CHANGES.NEW_FOLLOWS];
const AFTER_TODO: readonly FollowChange[] = [FOLLOW_CHANGES.UNFOLLOWED, FOLLOW_CHANGES.NEW_FOLLOWERS, FOLLOW_CHANGES.LOST_FOLLOWERS];

function Tab({ label, count, active, onClick, title }: { label: string; count?: number; active: boolean; onClick: () => void; title?: string }) {
  return (
    <Button
      size="sm"
      variant={active ? "solid" : "outline"}
      colorPalette={active ? "pink" : "gray"}
      aria-pressed={active}
      // An empty list can't be opened, unless it's the one being shown (it emptied while working through it).
      disabled={count === 0 && !active}
      title={title}
      onClick={onClick}
    >
      {count === undefined ? label : `${label} (${count})`}
    </Button>
  );
}

export function ViewTabs() {
  const dispatch = useAppDispatch();
  const view = useAppSelector(s => s.filters.view);
  const changeCounts = useAppSelector(selectFollowChangeCounts);
  const planned = useAppSelector(selectPlanStats).planned;
  const since = useAppSelector(selectChangesSince);
  const [lastTodo, setLastTodo] = useState<ActionType>(ACTION_TYPES.UNFOLLOW);

  const sinceTitle = since ? `Since your last save on ${formatDate(since)}` : "Since you started";
  const todoTotal = planned[ACTION_TYPES.UNFOLLOW] + planned[ACTION_TYPES.REMOVE_FOLLOWER];

  function openTodo(type: ActionType) {
    setLastTodo(type);
    dispatch(setView(ACTION_PLAN_VIEWS[type]));
  }

  function openTodoTab() {
    const other = lastTodo === ACTION_TYPES.UNFOLLOW ? ACTION_TYPES.REMOVE_FOLLOWER : ACTION_TYPES.UNFOLLOW;
    openTodo(planned[lastTodo] === 0 && planned[other] > 0 ? other : lastTodo);
  }

  const changeTab = (change: FollowChange) => (
    <Tab
      key={change}
      label={CHANGE_TAB_LABELS[change]}
      count={changeCounts[change]}
      active={view === change}
      title={sinceTitle}
      onClick={() => dispatch(setView(change))}
    />
  );

  // The To do tab groups the two plan views behind a switch.
  return (
    <Stack gap="2">
      <HStack gap="2" wrap="wrap">
        <Tab label="Review" active={view === LIST_VIEWS.REVIEW} onClick={() => dispatch(setView(LIST_VIEWS.REVIEW))} />
        {BEFORE_TODO.map(changeTab)}
        <Tab label="To do" count={todoTotal} active={isPlanView(view)} title="Accounts you plan to unfollow or remove" onClick={openTodoTab} />
        {AFTER_TODO.map(changeTab)}
      </HStack>
      {isPlanView(view) && (
        <HStack gap="2">
          {Object.values(ACTION_TYPES).map(type => (
            <Tab
              key={type}
              label={PLAN_LABELS[type].todo}
              count={planned[type]}
              active={view === ACTION_PLAN_VIEWS[type]}
              onClick={() => { openTodo(type); }}
            />
          ))}
        </HStack>
      )}
    </Stack>
  );
}
