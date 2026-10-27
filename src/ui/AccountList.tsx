import { useState } from "react";
import { Box, Text } from "@chakra-ui/react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useAppSelector } from "../store/hooks.ts";
import { selectListKeys } from "../store/listSlice.ts";
import { AccountCard } from "./AccountCard.tsx";

/** Rough card height before it is measured; real heights are measured as cards render. */
const ESTIMATED_CARD_HEIGHT = 190;
const CARD_GAP = 12;

/**
 * Only the cards near the screen are rendered, so 100k accounts scroll like 100. Uses the
 * page's own scrollbar; `scrollMargin` is where the list starts on the page.
 */
export function AccountList() {
  const keys = useAppSelector(selectListKeys);
  const [scrollMargin, setScrollMargin] = useState(0);
  const virtualizer = useWindowVirtualizer({
    count: keys.length,
    estimateSize: () => ESTIMATED_CARD_HEIGHT,
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
          <AccountCard accountKey={keys[item.index] ?? ""} />
        </Box>
      ))}
    </Box>
  );
}
