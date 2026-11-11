import { Button, CloseButton, Drawer, HStack, Menu, Portal, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { deleteTag, selectTagCounts, selectTags } from '@/entities/master';
import { plural } from '@/shared/lib/plural.ts';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';
import { useConfirm } from '@/shared/ui/useConfirm.ts';

import { RenameTagDialog } from './RenameTagDialog.tsx';

const NEW_TAGS = 'New tags are made on an account: open it and tap + New tag.';
const MENU_ROW = { h: '12', px: '3.5', textStyle: 'control' } as const;

function TagLine({ tag, count, onRename }: { tag: string; count: number; onRename: () => void }) {
  const dispatch = useAppDispatch();
  const confirm = useConfirm();

  async function remove() {
    const confirmed = await confirm({
      title: `Delete #${tag}?`,
      body: `It will be removed from ${plural(count, 'account')}. Their decisions and notes stay.`,
      confirmLabel: 'Delete',
      destructive: true,
    });
    if (confirmed) {
      dispatch(deleteTag({ tag }));
    }
  }

  return (
    <HStack as="li" minH="12" pl="3" pr="1" gap="3">
      <Text flex="1" minW="0" wordBreak="break-all">
        #{tag}
      </Text>
      <Text textStyle="small" color="fg.muted" flexShrink="0">
        {plural(count, 'account')}
      </Text>
      <Menu.Root positioning={{ placement: 'bottom-end' }} lazyMount unmountOnExit>
        <Menu.Trigger asChild>
          <Button variant="plain" w="10" h="10" minW="10" p="0" textStyle="name" aria-label={`Rename or delete ${tag}`}>
            ⋯
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content w="160px" p="0">
              <Menu.Item value="rename" {...MENU_ROW} borderBottomWidth="1px" onSelect={onRename}>
                Rename
              </Menu.Item>
              <Menu.Item value="delete" {...MENU_ROW} color="danger" onSelect={() => void remove()}>
                Delete
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
    </HStack>
  );
}

/** Rename and delete tags. A tag exists only while an account has it, so new ones are made on an account. */
function TagList() {
  const tags = useAppSelector(selectTags);
  const counts = useAppSelector(selectTagCounts);
  /** The tag being renamed; null = none. */
  const [renaming, setRenaming] = useState<string | null>(null);

  if (!tags.length) {
    return <Text color="fg.muted">No tags yet. {NEW_TAGS}</Text>;
  }
  return (
    <Stack gap="4">
      <Stack as="ul" listStyleType="none" gap="0" borderWidth="1px" css={{ '& > li + li': { borderTopWidth: '1px' } }}>
        {tags.map(tag => (
          <TagLine
            key={tag}
            tag={tag}
            count={counts[tag] ?? 0}
            onRename={() => {
              setRenaming(tag);
            }}
          />
        ))}
      </Stack>
      <Text color="fg.muted">{NEW_TAGS}</Text>
      <RenameTagDialog
        tag={renaming}
        onClose={() => {
          setRenaming(null);
        }}
      />
    </Stack>
  );
}

export function ManageTagsPopup({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={details => {
        if (!details.open) {
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
            <Drawer.Header display="block">
              <Drawer.Title textStyle="heading">Manage tags</Drawer.Title>
              <Text textStyle="small" color="fg.muted">
                Your tags are only for you.
              </Text>
            </Drawer.Header>
            <Drawer.Body pb="6">
              <TagList />
            </Drawer.Body>
            <Drawer.CloseTrigger asChild>
              <CloseButton variant="outline" aria-label="Close" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
