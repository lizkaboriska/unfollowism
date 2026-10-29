import { Box, Button, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { useAppSelector } from '../store/hooks.ts';
import { selectHasProject, selectIsDirty, selectUnsavedAccountCount } from '../store/selectors.ts';

import { ResetButton, SaveButton } from './saveAndReset.tsx';
import { UnsavedDrawer } from './UnsavedDrawer.tsx';

/**
 * `onImportNew` is given on the main view: it shows the Import files button, and the
 * Saved / Unsaved changes indicator becomes a button that opens the list of unsaved changes.
 */
export function Header({ onImportNew }: { onImportNew?: () => void }) {
  const hasProject = useAppSelector(selectHasProject);
  const dirty = useAppSelector(selectIsDirty);
  const unsavedCount = useAppSelector(selectUnsavedAccountCount);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const indicator = dirty ? (unsavedCount ? `Unsaved changes (${unsavedCount})` : 'Unsaved changes') : 'Saved';
  const color = dirty ? 'yellow.700' : 'green.700';

  return (
    <Stack
      direction={{ base: 'column', md: 'row' }}
      justify="space-between"
      align={{ base: 'stretch', md: 'center' }}
      gap="3"
    >
      <Box>
        <Heading size="2xl">Instagram Review</Heading>
        <Text color="fg.muted">Keep your feed fun. Keep your people intentional.</Text>
      </Box>
      <HStack gap="3" wrap="wrap">
        {hasProject &&
          (onImportNew ? (
            <Button
              variant="ghost"
              color={color}
              onClick={() => {
                setDrawerOpen(true);
              }}
            >
              {indicator}
            </Button>
          ) : (
            <Text color={color}>{indicator}</Text>
          ))}
        {hasProject && onImportNew && (
          <Button variant="outline" onClick={onImportNew}>
            Import files
          </Button>
        )}
        <ResetButton />
        <SaveButton />
      </HStack>
      <UnsavedDrawer
        open={drawerOpen}
        onClose={() => {
          setDrawerOpen(false);
        }}
      />
    </Stack>
  );
}
