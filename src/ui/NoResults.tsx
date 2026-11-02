import { Box, Button, HStack, Heading, Text } from '@chakra-ui/react';

import { DecisionFilter, TAG_FILTER_KINDS } from '@/entities/master/lib/index.ts';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';

import { clearFilters, setQuery } from '../store/filtersSlice.ts';

/** Review with nothing to show: says why, and offers to clear what narrows the list. */
export function NoResults() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(s => s.filters);
  const query = filters.query.trim();
  const filtered = filters.tag.kind !== TAG_FILTER_KINDS.ALL || filters.decision !== DecisionFilter.ANY;

  let text = 'No accounts in this list.';
  if (query) {
    text = `No usernames match “${query}”${filtered ? ' with these filters' : ''}.`;
  } else if (filtered) {
    text = 'No accounts match these filters.';
  }
  return (
    <Box as="section" aria-labelledby="no-results-title" borderWidth="1px" p="4">
      <Heading as="h2" id="no-results-title" textStyle="sheetTitle">
        No accounts found
      </Heading>
      <Text color="fg.muted" mt="1">
        {text}
      </Text>
      {(query || filtered) && (
        <HStack gap="4" mt="3">
          {query && <Button onClick={() => dispatch(setQuery(''))}>Clear search</Button>}
          {filtered && (
            <Button
              variant="plain"
              p="0"
              textDecoration="underline"
              textUnderlineOffset="3px"
              onClick={() => dispatch(clearFilters())}
            >
              Clear filters
            </Button>
          )}
        </HStack>
      )}
    </Box>
  );
}
