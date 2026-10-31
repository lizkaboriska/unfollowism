import { Input, Stack } from '@chakra-ui/react';
import { useMemo, useState } from 'react';

import { DecisionFilter, TAG_FILTER_KINDS, type TagFilter } from '../core/index.ts';
import { isPlanView, setDecisionFilter, setQuery, setTagFilter } from '../store/filtersSlice.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { selectTagCounts, selectTags } from '../store/selectors.ts';

import { FilterSelect, type FilterOption } from './FilterSelect.tsx';
import { DECISION_FILTER_LABELS, tagFilterLabel } from './labels.ts';
import { ManageTagsDialog } from './ManageTagsDialog.tsx';

// A tag can be any text (even "untagged"), so the tag select uses positions as option values.
const ALL_TAGS_VALUE = 'all';
const UNTAGGED_VALUE = 'untagged';
/** The last line of the tag list opens Manage tags instead of filtering. */
const MANAGE_TAGS_VALUE = 'manage';
const tagValue = (index: number) => `tag-${index}`;

const DECISION_OPTIONS: readonly FilterOption<DecisionFilter>[] = Object.values(DecisionFilter).map(decision => ({
  value: decision,
  label: DECISION_FILTER_LABELS[decision],
}));

function tagFilterValue(tag: TagFilter, tags: readonly string[]): string {
  if (tag.kind === TAG_FILTER_KINDS.ALL) {
    return ALL_TAGS_VALUE;
  }
  if (tag.kind === TAG_FILTER_KINDS.UNTAGGED) {
    return UNTAGGED_VALUE;
  }
  return tagValue(tags.indexOf(tag.tag));
}

function tagFilterOf(value: string, tags: readonly string[]): TagFilter {
  if (value === UNTAGGED_VALUE) {
    return { kind: TAG_FILTER_KINDS.UNTAGGED };
  }
  const tag = tags.find((_, i) => tagValue(i) === value);
  return tag === undefined ? { kind: TAG_FILTER_KINDS.ALL } : { kind: TAG_FILTER_KINDS.TAG, tag };
}

/** The filter row of the change and To do tabs (Review has its own list controls and Filter sheet). */
export function FiltersBar() {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(s => s.filters);
  const tags = useAppSelector(selectTags);
  const tagCounts = useAppSelector(selectTagCounts);
  const [tagsOpen, setTagsOpen] = useState(false);

  const tagOptions = useMemo(
    (): FilterOption[] => [
      { value: ALL_TAGS_VALUE, label: tagFilterLabel({ kind: TAG_FILTER_KINDS.ALL }) },
      { value: UNTAGGED_VALUE, label: tagFilterLabel({ kind: TAG_FILTER_KINDS.UNTAGGED }) },
      ...tags.map((tag, i) => ({
        value: tagValue(i),
        label: tag,
        count: tagCounts[tag] ?? 0,
        separatorBefore: i === 0,
      })),
      { value: MANAGE_TAGS_VALUE, label: 'Manage tags…', separatorBefore: true },
    ],
    [tags, tagCounts],
  );

  function onTagChange(value: string) {
    if (value === MANAGE_TAGS_VALUE) {
      setTagsOpen(true);
    } else {
      dispatch(setTagFilter(tagFilterOf(value, tags)));
    }
  }

  return (
    <Stack direction={{ base: 'column', md: 'row' }} gap="2" align={{ base: 'stretch', md: 'center' }} wrap="wrap">
      <Input
        size="sm"
        name="search"
        autoComplete="off"
        width={{ base: 'full', md: '48' }}
        placeholder="Search username"
        aria-label="Search username"
        value={filters.query}
        onChange={e => dispatch(setQuery(e.currentTarget.value))}
      />
      {!isPlanView(filters.view) && (
        <FilterSelect
          name="decision"
          label="Your decision"
          options={DECISION_OPTIONS}
          value={filters.decision}
          onChange={value => dispatch(setDecisionFilter(value))}
        />
      )}
      <FilterSelect
        name="tag"
        label="Tag"
        options={tagOptions}
        value={tagFilterValue(filters.tag, tags)}
        onChange={onTagChange}
      />
      <ManageTagsDialog
        open={tagsOpen}
        onClose={() => {
          setTagsOpen(false);
        }}
      />
    </Stack>
  );
}
