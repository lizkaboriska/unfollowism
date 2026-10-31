import { Button, CloseButton, Dialog, HStack, Input, Portal, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { findTag } from '../core/index.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { deleteTag, renameTag } from '../store/masterSlice.ts';
import { selectTagCounts, selectTags } from '../store/selectors.ts';

import { useConfirm } from './dialogHooks.ts';
import { plural } from './statusText.ts';

interface Editing {
  tag: string;
  draft: string;
  /** Why the draft can't be saved; null when it can. */
  error: string | null;
}

/** Rename and delete tags. New tags are created with "+ tag" on a card. */
function TagLines() {
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  const tags = useAppSelector(selectTags);
  const counts = useAppSelector(selectTagCounts);
  const [editing, setEditing] = useState<Editing | null>(null);

  if (!tags.length) {
    return <Text color="fg.muted">No tags yet. Use + tag on any card to create one.</Text>;
  }

  const count = (tag: string) => counts[tag] ?? 0;

  async function save({ tag, draft }: Editing) {
    const name = draft.trim();
    if (!name) {
      setEditing({ tag, draft, error: 'A tag needs a name.' });
      return;
    }
    const existing = findTag(
      tags.filter(t => t !== tag),
      name,
    );
    if (existing) {
      const merge = await confirm({
        title: 'Merge tags?',
        body:
          `${existing} already exists. Merge ${tag} into ${existing}? ` +
          `${plural(count(tag), 'account')} will have ${existing} instead.`,
        confirmLabel: 'Merge',
      });
      if (!merge) {
        return;
      }
    }
    dispatch(renameTag({ from: tag, to: existing ?? name }));
    setEditing(null);
  }

  async function remove(tag: string) {
    const confirmed = await confirm({
      title: `Delete tag ${tag}?`,
      body: `It will be removed from ${plural(count(tag), 'account')}.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      dispatch(deleteTag({ tag }));
    }
  }

  return (
    <Stack gap="3">
      {tags.map(tag => (
        <Stack
          key={tag}
          direction={{ base: 'column', sm: 'row' }}
          gap="2"
          align={{ base: 'stretch', sm: 'center' }}
          borderBottomWidth="1px"
          pb="2"
        >
          {editing?.tag === tag ? (
            <Stack flex="1" gap="1">
              <HStack>
                <Input
                  size="sm"
                  autoFocus
                  name={`renameTag-${tag}`}
                  autoComplete="off"
                  aria-label={`New name for ${tag}`}
                  value={editing.draft}
                  onChange={e => {
                    setEditing({ tag, draft: e.currentTarget.value, error: null });
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      void save(editing);
                    }
                  }}
                />
                <Button size="sm" onClick={() => void save(editing)}>
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditing(null);
                  }}
                >
                  Cancel
                </Button>
              </HStack>
              {editing.error && (
                <Text fontSize="sm" color="fg.error">
                  {editing.error}
                </Text>
              )}
            </Stack>
          ) : (
            <>
              <Text flex="1" fontWeight="medium">
                {tag}
              </Text>
              <Text color="fg.muted" fontSize="sm">
                {plural(count(tag), 'account')}
              </Text>
              <HStack gap="1">
                <Button
                  size="xs"
                  variant="outline"
                  onClick={() => {
                    setEditing({ tag, draft: tag, error: null });
                  }}
                >
                  Rename
                </Button>
                <Button size="xs" variant="outline" colorPalette="danger" onClick={() => void remove(tag)}>
                  Delete
                </Button>
              </HStack>
            </>
          )}
        </Stack>
      ))}
      <Text fontSize="sm" color="fg.muted">
        New tags: use + tag on any card.
      </Text>
    </Stack>
  );
}

export function ManageTagsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={e => {
        if (!e.open) {
          onClose();
        }
      }}
      placement="center"
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx="4">
            <Dialog.Header>
              <Dialog.Title>Manage tags</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <TagLines />
            </Dialog.Body>
            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
