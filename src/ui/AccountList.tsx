import { useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useAppSelector } from "../store/hooks.ts";
import { ACTION_TYPES, type ActionType } from "../core/index.ts";
import { LIST_VIEWS, type ListView } from "../store/filtersSlice.ts";
import { selectListKeys } from "../store/listSlice.ts";
import { AccountCard } from "./AccountCard.tsx";
import { TodoRow } from "./TodoRow.tsx";

/** The To do lists show compact rows for their action; every other view shows full cards. */
const TODO_ACTIONS: Partial<Record<ListView, ActionType>> = {
  [LIST_VIEWS.TO_UNFOLLOW]: ACTION_TYPES.UNFOLLOW,
  [LIST_VIEWS.TO_REMOVE]: ACTION_TYPES.REMOVE_FOLLOWER,
};

/** Rough heights before measuring; real heights are measured as items render. */
const ESTIMATED_CARD_HEIGHT = 190;
const ESTIMATED_ROW_HEIGHT = 72;
const CARD_GAP = 12;

/**
 * Only the cards near the screen are rendered, so 100k accounts scroll like 100. Uses the
 * page's own scrollbar; `scrollMargin` is where the list starts on the page.
 */
export function AccountList() {
  const keys = useAppSelector(selectListKeys);
  const todoAction = useAppSelector(s => TODO_ACTIONS[s.filters.view]);
  const [scrollMargin, setScrollMargin] = useState(0);
  const virtualizer = useWindowVirtualizer({
    count: keys.length,
    estimateSize: () => (todoAction ? ESTIMATED_ROW_HEIGHT : ESTIMATED_CARD_HEIGHT),
    gap: CARD_GAP,
    overscan: 6,
    scrollMargin,
    getItemKey: index => keys[index] ?? index,
  });

  if (!keys.length) return <Text color="fg.muted">No accounts match the current filters.</Text>;

  return (
    <Box
      ref={(node: HTMLDivElement | null) => { if (node) setScrollMargin(node.offsetTop); }}
      position="relative"
      height={`${virtualizer.getTotalSize()}px`}
    >
      {virtualizer.getVirtualItems().map(item => (
        <Box
          key={item.key}
          ref={virtualizer.measureElement}
          data-index={item.index}
          position="absolute"
          top="0"
          left="0"
          width="100%"
          transform={`translateY(${item.start - scrollMargin}px)`}
        >
          {todoAction
            ? <TodoRow accountKey={keys[item.index] ?? ""} type={todoAction} />
            : <AccountCard accountKey={keys[item.index] ?? ""} />}
        </Box>
      ))}
    </Box>
  );
}
