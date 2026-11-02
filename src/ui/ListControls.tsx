import { Button, CloseButton, HStack, Input, InputGroup, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';
import { useDebouncedCallback } from 'use-debounce';

import { DecisionFilter, TAG_FILTER_KINDS } from '@/entities/master/lib/index.ts';

import { NO_FILTERS, clearFilters, setDecisionFilter, setQuery, setTagFilter } from '../store/filtersSlice.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { selectListKeys } from '../store/listSlice.ts';

import { DECISION_FILTER_LABELS, SCOPE_LABELS, tagFilterLabel } from './labels.ts';
import { plural } from './statusText.ts';

interface Chip {
  /** Which filter: a tag can be named like a decision ("Kept"). */
  id: 'tag' | 'decision';
  label: string;
  remove: () => void;
}

/**
 * Search, Filter, and what the list shows: the list chip (always there, opens the Filter sheet) and a removable
 * chip per filter. The Filter count and "Clear all" cover only those removable filters, never the list.
 */
export function ListControls({ onOpenFilter }: { onOpenFilter: () => void }) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(s => s.filters);
  const shown = useAppSelector(selectListKeys).length;

  const chips: Chip[] = [];
  if (filters.tag.kind !== TAG_FILTER_KINDS.ALL) {
    chips.push({ id: 'tag', label: tagFilterLabel(filters.tag), remove: () => dispatch(setTagFilter(NO_FILTERS.tag)) });
  }
  if (filters.decision !== DecisionFilter.ANY) {
    chips.push({
      id: 'decision',
      label: DECISION_FILTER_LABELS[filters.decision],
      remove: () => dispatch(setDecisionFilter(NO_FILTERS.decision)),
    });
  }
  const scope = SCOPE_LABELS[filters.scope];

  return (
    <Stack gap="3">
      <HStack gap="2">
        <SearchBox />
        <Button variant="outline" h="11" onClick={onOpenFilter}>
          Filter{chips.length > 0 && ' '}
          {chips.length > 0 && (
            <Text as="span" textStyle="count">
              {chips.length}
            </Text>
          )}
        </Button>
      </HStack>
      <HStack gap="2" wrap="wrap">
        <Button variant="outline" size="sm" h="8" aria-label={`Showing ${scope}. Change list`} onClick={onOpenFilter}>
          {scope} ▾
        </Button>
        {chips.map(chip => (
          <Button
            key={chip.id}
            variant="outline"
            size="sm"
            h="8"
            aria-label={`Remove filter ${chip.label}`}
            onClick={chip.remove}
          >
            {chip.label} ×
          </Button>
        ))}
        {chips.length >= 2 && (
          <Button
            variant="plain"
            size="sm"
            h="8"
            px="0.5"
            textDecoration="underline"
            textUnderlineOffset="3px"
            onClick={() => dispatch(clearFilters())}
          >
            Clear all
          </Button>
        )}
        <Text ml="auto" textStyle="small" color="fg.muted">
          {plural(shown, 'account')}
        </Text>
      </HStack>
    </Stack>
  );
}

/** How long search waits after the last keystroke before refiltering: per key is too slow at 100k accounts. */
const SEARCH_DEBOUNCE_MS = 200;

/** The search field. Letters show at once; the list follows once typing pauses. */
function SearchBox() {
  const dispatch = useAppDispatch();
  const query = useAppSelector(s => s.filters.query);
  const [draft, setDraft] = useState(query);
  // flushOnExit: leaving Review mid-typing still applies the search.
  const storeQuery = useDebouncedCallback((value: string) => dispatch(setQuery(value)), SEARCH_DEBOUNCE_MS, {
    flushOnExit: true,
  });

  // The stored search changed (from typing here, or from elsewhere): show it unless more typing is on its way.
  const [shownQuery, setShownQuery] = useState(query);
  if (query !== shownQuery) {
    setShownQuery(query);
    if (!storeQuery.isPending()) {
      setDraft(query);
    }
  }

  const clear = () => {
    storeQuery.cancel();
    setDraft('');
    dispatch(setQuery(''));
  };

  return (
    <InputGroup
      flex="1"
      startElement={<Text aria-hidden>&gt;</Text>}
      endElement={draft ? <CloseButton size="sm" aria-label="Clear search" onClick={clear} /> : undefined}
    >
      <Input
        h="11"
        name="search"
        type="search"
        autoComplete="off"
        placeholder="search accounts"
        aria-label="Search accounts"
        value={draft}
        onChange={e => {
          setDraft(e.currentTarget.value);
          storeQuery(e.currentTarget.value);
        }}
      />
    </InputGroup>
  );
}
