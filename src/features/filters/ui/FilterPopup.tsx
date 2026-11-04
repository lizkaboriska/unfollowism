import { Box, Button, CloseButton, Drawer, HStack, Portal, Stack, Text, Wrap } from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';

import { DecisionFilter, REVIEW_SCOPES, TAG_FILTER_KINDS, type TagFilter } from '@/entities/master';
import { selectTags, DECISION_FILTER_LABELS, SCOPE_LABELS, tagFilterLabel, plural } from '@/entities/master';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';

import { NO_FILTERS, applyFilters, type FilterChoice } from '../model/filtersSlice.ts';
import { selectMatchingCount, selectScopeTotals } from '../model/selectors.ts';

function sameTag(a: TagFilter, b: TagFilter): boolean {
  return a.kind === b.kind && (a.kind !== TAG_FILTER_KINDS.TAG || (b.kind === TAG_FILTER_KINDS.TAG && a.tag === b.tag));
}

function Group({ legend, aside, children }: { legend: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <Box as="fieldset">
      <HStack justify="space-between" mb="2">
        <Text as="legend" textStyle="control">
          {legend}
        </Text>
        {aside}
      </HStack>
      {children}
    </Box>
  );
}

/** One choice of a group: selected = black fill. */
function Choice({ label, pressed, onClick }: { label: string; pressed: boolean; onClick: () => void }) {
  return (
    <Button size="sm" h="8" variant={pressed ? 'solid' : 'outline'} aria-pressed={pressed} onClick={onClick}>
      {label}
    </Button>
  );
}

/**
 * The choices are a draft: the list behind the popup changes only on "Show N accounts", and closing forgets them.
 * Reset clears the filters but keeps the list, like "Clear all".
 */
function FilterChoices({ onClose, onManageTags }: { onClose: () => void; onManageTags: () => void }) {
  const dispatch = useAppDispatch();
  const filters = useAppSelector(s => s.filters);
  const tags = useAppSelector(selectTags);
  const totals = useAppSelector(selectScopeTotals);
  const [draft, setDraft] = useState<FilterChoice>({
    scope: filters.scope,
    tag: filters.tag,
    decision: filters.decision,
  });
  const matching = useAppSelector(s => selectMatchingCount(s, { ...filters, ...draft }));
  const choose = (choice: Partial<FilterChoice>) => {
    setDraft(current => ({ ...current, ...choice }));
  };
  const tagChoices: TagFilter[] = [
    NO_FILTERS.tag,
    { kind: TAG_FILTER_KINDS.UNTAGGED },
    ...tags.map((tag): TagFilter => ({ kind: TAG_FILTER_KINDS.TAG, tag })),
  ];

  return (
    <>
      <Drawer.Body>
        <Stack gap="5">
          <Group legend="Show">
            <Stack gap="0">
              {Object.values(REVIEW_SCOPES).map((scope, i) => {
                const pressed = draft.scope === scope;
                return (
                  <Button
                    key={scope}
                    variant={pressed ? 'solid' : 'outline'}
                    aria-pressed={pressed}
                    justifyContent="space-between"
                    mt={i === 0 ? '0' : '-1px'}
                    onClick={() => {
                      choose({ scope });
                    }}
                  >
                    <span>{SCOPE_LABELS[scope]}</span>
                    <Text as="span" textStyle="small" color={pressed ? 'paper' : 'fg.muted'}>
                      {totals[scope]}
                    </Text>
                  </Button>
                );
              })}
            </Stack>
          </Group>
          <Group
            legend="Tag"
            aside={
              <Button
                variant="plain"
                h="auto"
                p="0"
                textStyle="body"
                textDecoration="underline"
                textUnderlineOffset="3px"
                onClick={onManageTags}
              >
                Manage tags
              </Button>
            }
          >
            <Wrap gap="2">
              {tagChoices.map(tag => (
                <Choice
                  key={tag.kind === TAG_FILTER_KINDS.TAG ? `tag:${tag.tag}` : tag.kind}
                  label={tagFilterLabel(tag)}
                  pressed={sameTag(draft.tag, tag)}
                  onClick={() => {
                    choose({ tag });
                  }}
                />
              ))}
            </Wrap>
          </Group>
          <Group legend="Your decision">
            <Wrap gap="2">
              {Object.values(DecisionFilter).map(decision => (
                <Choice
                  key={decision}
                  label={DECISION_FILTER_LABELS[decision]}
                  pressed={draft.decision === decision}
                  onClick={() => {
                    choose({ decision });
                  }}
                />
              ))}
            </Wrap>
          </Group>
          <Text color="fg.muted">Filters change what you see, not your decisions.</Text>
        </Stack>
      </Drawer.Body>
      <Drawer.Footer>
        <Button
          variant="outline"
          onClick={() => {
            choose(NO_FILTERS);
          }}
        >
          Reset
        </Button>
        <Button
          flex="1"
          onClick={() => {
            dispatch(applyFilters(draft));
            onClose();
          }}
        >
          Show {plural(matching, 'account')}
        </Button>
      </Drawer.Footer>
    </>
  );
}

/** `onManageTags`: the Filter popup closes and Manage tags opens (popups never stack). */
export function FilterPopup({
  open,
  onClose,
  onManageTags,
}: {
  open: boolean;
  onClose: () => void;
  onManageTags: () => void;
}) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={e => {
        if (!e.open) {
          onClose();
        }
      }}
      placement="bottom"
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title textStyle="heading">Filter</Drawer.Title>
            </Drawer.Header>
            <FilterChoices onClose={onClose} onManageTags={onManageTags} />
            <Drawer.CloseTrigger asChild>
              <CloseButton variant="outline" aria-label="Close" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
