import { Box } from '@chakra-ui/react';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

import { useAppSelector } from '@/shared/lib/storeHooks.ts';

import { selectListKeys } from '../store/listSlice.ts';

const CARD_GAP = 12;

/**
 * How a list draws its accounts (Review's cards, To do's rows), a rough height before measuring (real heights are
 * measured as items render), and what it shows when empty.
 */
export interface ListItems {
  render: (accountKey: string) => ReactNode;
  estimatedHeight: number;
  empty: ReactNode;
}

/**
 * Only the cards near the screen are rendered, so 100k accounts scroll like 100. Uses the
 * page's own scrollbar; `scrollMargin` is where the list starts on the page.
 */
export function AccountList({ items }: { items: ListItems }) {
  const keys = useAppSelector(selectListKeys);
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
    estimateSize: () => items.estimatedHeight,
    gap: CARD_GAP,
    overscan: 6,
    scrollMargin,
    getItemKey: index => keys[index] ?? index,
  });

  if (!hasList) {
    return items.empty;
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
          {items.render(keys[item.index] ?? '')}
        </Box>
      ))}
    </Box>
  );
}
