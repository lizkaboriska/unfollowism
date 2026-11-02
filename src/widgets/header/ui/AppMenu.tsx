import { Button, Menu, Portal } from '@chakra-ui/react';
import { useState } from 'react';

import { ManageTagsSheet } from '@/features/manage-tags/ManageTagsSheet.tsx';
import { useResetChanges } from '@/features/save-reset/useResetChanges.tsx';

const ROW = { h: '12', px: '3.5', textStyle: 'control' } as const;

/** The ⋯ menu: framed rows divided by 1px lines; Reset changes in red. */
export function AppMenu({ onImportNew }: { onImportNew: () => void }) {
  const { canReset, reset } = useResetChanges();
  const [tagsOpen, setTagsOpen] = useState(false);

  return (
    <>
      <Menu.Root positioning={{ placement: 'bottom-end' }} lazyMount unmountOnExit>
        <Menu.Trigger asChild>
          <Button variant="outline" w="10" h="10" minW="10" p="0" textStyle="name" aria-label="More">
            ⋯
          </Button>
        </Menu.Trigger>
        <Portal>
          <Menu.Positioner>
            <Menu.Content w="220px" p="0">
              <Menu.Item value="import" {...ROW} borderBottomWidth="1px" onSelect={onImportNew}>
                Import new files
              </Menu.Item>
              <Menu.Item
                value="tags"
                {...ROW}
                borderBottomWidth="1px"
                onSelect={() => {
                  setTagsOpen(true);
                }}
              >
                Manage tags
              </Menu.Item>
              <Menu.Item value="reset" {...ROW} color="danger" disabled={!canReset} onSelect={() => void reset()}>
                Reset changes
              </Menu.Item>
            </Menu.Content>
          </Menu.Positioner>
        </Portal>
      </Menu.Root>
      <ManageTagsSheet
        open={tagsOpen}
        onClose={() => {
          setTagsOpen(false);
        }}
      />
    </>
  );
}
