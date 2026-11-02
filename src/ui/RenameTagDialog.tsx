import { Alert, Button, Dialog, Field, Input, Portal, Stack } from '@chakra-ui/react';
import { useState } from 'react';

import { findTag } from '../core/index.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { renameTag } from '../store/masterSlice.ts';
import { selectTagCounts, selectTags } from '../store/selectors.ts';

/** The field and buttons; mounted per opening, so the field starts from the tag's name. */
function RenameForm({ tag, onClose }: { tag: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const tags = useAppSelector(selectTags);
  const count = useAppSelector(selectTagCounts)[tag] ?? 0;
  const [draft, setDraft] = useState(tag);
  const name = draft.trim();
  // Renaming onto another tag (any case) merges the two.
  const existing = findTag(
    tags.filter(t => t !== tag),
    name,
  );

  const who = count === 1 ? 'the account gets' : `the ${String(count)} accounts get`;
  const mergeText = `Saving merges the two tags: ${who} #${existing ?? ''}.`;

  function save() {
    if (!name) {
      return;
    }
    dispatch(renameTag({ from: tag, to: existing ?? name }));
    onClose();
  }

  return (
    <>
      <Dialog.Body>
        <Stack gap="4">
          <Field.Root>
            <Field.Label textStyle="small" color="fg.muted">
              Tag name
            </Field.Label>
            <Input
              h="11"
              autoFocus
              name="tagName"
              autoComplete="off"
              value={draft}
              onChange={e => {
                setDraft(e.currentTarget.value);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  save();
                }
              }}
            />
          </Field.Root>
          {existing && (
            <Alert.Root status="warning" role="note">
              <Alert.Content>
                <Alert.Title textStyle="control">⚠ #{existing} already exists</Alert.Title>
                <Alert.Description color="fg.muted">{mergeText}</Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
        </Stack>
      </Dialog.Body>
      <Dialog.Footer flexDirection="column" alignItems="stretch" gap="2">
        <Button h="11" disabled={!name} onClick={save}>
          {existing ? 'Merge' : 'Rename'}
        </Button>
        <Button h="11" variant="outline" onClick={onClose}>
          Cancel
        </Button>
      </Dialog.Footer>
    </>
  );
}

/** Rename one tag; a name that already exists merges the two. `tag` null = closed. */
export function RenameTagDialog({ tag, onClose }: { tag: string | null; onClose: () => void }) {
  return (
    <Dialog.Root
      open={tag !== null}
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
            {tag !== null && (
              <>
                <Dialog.Header>
                  <Dialog.Title textStyle="sheetTitle" wordBreak="break-all">
                    Rename #{tag}
                  </Dialog.Title>
                </Dialog.Header>
                <RenameForm tag={tag} onClose={onClose} />
              </>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
