import { useState } from 'react';
import { Box, Button, CloseButton, Drawer, HStack, Portal, SimpleGrid, Stack, Text } from '@chakra-ui/react';
import {
  SESSION_CATEGORIES,
  SESSION_CHANGE_CATEGORY,
  SESSION_CHANGES,
  type SessionCategory,
  type SessionChange,
  type TagChangeType,
} from '../core/index.ts';
import { useAppSelector } from '../store/hooks.ts';
import { selectUnsavedDiff, selectUnsavedSummary } from '../store/selectors.ts';
import { ProfileLink } from './ProfileLink.tsx';
import { ResetButton, SaveButton } from './saveAndReset.tsx';
import { CATEGORY_LABELS, changeLine } from './sessionText.ts';
import { plural } from './statusText.ts';

/** Accounts listed at most; a big Reset scope can touch thousands. */
const MAX_ACCOUNTS = 200;

/** Drawer tabs; "Other" changes (notes, unavailable) show under All. */
const TAB_CATEGORIES: readonly SessionCategory[] = [
  SESSION_CATEGORIES.REVIEWS,
  SESSION_CATEGORIES.TAGS,
  SESSION_CATEGORIES.ACTIONS,
];

interface TagFocus {
  tag: string;
  type: TagChangeType;
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <Button
      size="xs"
      variant={active ? 'solid' : 'ghost'}
      colorPalette={active ? 'pink' : 'gray'}
      aria-pressed={active}
      onClick={onClick}
    >
      {label}
    </Button>
  );
}

/** What isn't in the downloaded master yet. Mounted only while the drawer is open. */
function UnsavedChanges() {
  const diff = useAppSelector(selectUnsavedDiff);
  const summary = useAppSelector(selectUnsavedSummary);
  /** null = All. */
  const [category, setCategory] = useState<SessionCategory | null>(null);
  const [tagFocus, setTagFocus] = useState<TagFocus | null>(null);

  if (!diff.length) return <Text color="fg.muted">No edits since your last save.</Text>;

  const matches = (change: SessionChange) => {
    if (tagFocus) return change.type === tagFocus.type && change.tag === tagFocus.tag;
    return category === null || SESSION_CHANGE_CATEGORY[change.type] === category;
  };
  const visible = diff
    .map(entry => ({ ...entry, changes: entry.changes.filter(matches) }))
    .filter(entry => entry.changes.length);
  const tagRows = [
    ...summary.tagsAdded.map(({ tag, count }) => ({ tag, count, type: SESSION_CHANGES.TAG_ADDED })),
    ...summary.tagsRemoved.map(({ tag, count }) => ({ tag, count, type: SESSION_CHANGES.TAG_REMOVED })),
  ];
  const showTagRows = tagRows.length > 0 && (category === null || category === SESSION_CATEGORIES.TAGS);
  const selectCategory = (next: SessionCategory | null) => {
    setCategory(next);
    setTagFocus(null);
  };

  return (
    <Stack gap="4">
      <Text color="fg.muted">
        {plural(summary.changedAccounts, 'account')} · {plural(summary.changeCount, 'change')}
      </Text>
      <SimpleGrid columns={4} gap="2">
        {Object.values(SESSION_CATEGORIES).map(c => (
          <Box key={c} borderWidth="1px" borderRadius="md" p="2" textAlign="center">
            <Text fontWeight="bold">{summary.byCategory[c]}</Text>
            <Text fontSize="xs" color="fg.muted">
              {CATEGORY_LABELS[c]}
            </Text>
          </Box>
        ))}
      </SimpleGrid>
      <HStack gap="1" wrap="wrap">
        <TabButton
          label="All"
          active={category === null}
          onClick={() => {
            selectCategory(null);
          }}
        />
        {TAB_CATEGORIES.map(c => (
          <TabButton
            key={c}
            label={CATEGORY_LABELS[c]}
            active={category === c}
            onClick={() => {
              selectCategory(c);
            }}
          />
        ))}
      </HStack>

      {showTagRows && (
        <Stack gap="1">
          {tagRows.map(row => {
            const focused = tagFocus?.tag === row.tag && tagFocus.type === row.type;
            const sign = row.type === SESSION_CHANGES.TAG_ADDED ? '+' : '−';
            return (
              <Button
                key={`${row.type}:${row.tag}`}
                size="sm"
                variant={focused ? 'subtle' : 'outline'}
                justifyContent="space-between"
                aria-pressed={focused}
                onClick={() => {
                  setTagFocus(focused ? null : { tag: row.tag, type: row.type });
                }}
              >
                <span>{row.tag}</span>
                <span>
                  {sign}
                  {row.count}
                </span>
              </Button>
            );
          })}
        </Stack>
      )}

      <Stack gap="3">
        {visible.slice(0, MAX_ACCOUNTS).map(entry => (
          <Box key={entry.username}>
            <ProfileLink username={entry.username} />
            {entry.changes.map((change, i) => {
              const line = changeLine(change);
              return (
                <HStack key={i} gap="2" fontSize="sm">
                  <Text as="span" w="4" textAlign="center" aria-hidden>
                    {line.symbol}
                  </Text>
                  <Text as="span">{line.text}</Text>
                </HStack>
              );
            })}
          </Box>
        ))}
        {visible.length > MAX_ACCOUNTS && (
          <Text color="fg.muted">and {plural(visible.length - MAX_ACCOUNTS, 'more account')}</Text>
        )}
      </Stack>
    </Stack>
  );
}

export function UnsavedDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={e => {
        if (!e.open) onClose();
      }}
      placement="end"
      size={{ base: 'full', md: 'md' }}
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title>Unsaved changes</Drawer.Title>
            </Drawer.Header>
            <Drawer.Body>
              <UnsavedChanges />
            </Drawer.Body>
            <Drawer.Footer>
              <ResetButton />
              <SaveButton />
            </Drawer.Footer>
            <Drawer.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
