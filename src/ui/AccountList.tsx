import { Box, Text } from '@chakra-ui/react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState } from 'react';

import { PLAN_VIEW_ACTIONS, isPlanView } from '../store/filtersSlice.ts';
import { useAppSelector } from '../store/hooks.ts';
import { selectListKeys } from '../store/listSlice.ts';

import { AccountCard } from './AccountCard.tsx';
import { TodoRow } from './TodoRow.tsx';

/** Rough heights before measuring; real heights are measured as items render. */
const ESTIMATED_CARD_HEIGHT = 190;
const ESTIMATED_ROW_HEIGHT = 72;
const CARD_GAP = 12;

/**
 * Only the cards near the screen are rendered, so 100k accounts scroll like 100. Uses the
 * page's own scrollbar; `scrollMargin` is where the list starts on the page.
 * The To do lists show compact rows for their action; every other view shows full cards.
 */
export function AccountList() {
  const keys = useAppSelector(selectListKeys);
  const todoAction = useAppSelector(s => (isPlanView(s.filters.view) ? PLAN_VIEW_ACTIONS[s.filters.view] : undefined));
  const [scrollMargin, setScrollMargin] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const hasList = keys.length > 0;

  // Where the list starts moves when something above it changes height (status line, warnings),
  // so it is measured again whenever the page resizes, not only when the list renders.
  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }
    const measure = () => {
      setScrollMargin(node.offsetTop);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      return;
    } // tests (jsdom)
    const observer = new ResizeObserver(measure);
    observer.observe(document.body);
    return () => {
      observer.disconnect();
    };
  }, [hasList]);

  const virtualizer = useWindowVirtualizer({
    count: keys.length,
    estimateSize: () => (todoAction ? ESTIMATED_ROW_HEIGHT : ESTIMATED_CARD_HEIGHT),
    gap: CARD_GAP,
    overscan: 6,
    scrollMargin,
    getItemKey: index => keys[index] ?? index,
  });

  if (!hasList) {
    return <Text color="fg.muted">No accounts match the current filters.</Text>;
  }

  return (
    <Box ref={listRef} position="relative" height={`${virtualizer.getTotalSize()}px`}>
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
          {todoAction ? (
            <TodoRow accountKey={keys[item.index] ?? ''} type={todoAction} />
          ) : (
            <AccountCard accountKey={keys[item.index] ?? ''} />
          )}
        </Box>
      ))}
    </Box>
  );
}
