import { Box, Button, HStack, Heading, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { useAppSelector } from '../store/hooks.ts';
import { selectHasProject, selectIsDirty, selectUnsavedAccountCount } from '../store/selectors.ts';

import { AccountSheet } from './AccountSheet.tsx';
import { AppMenu } from './AppMenu.tsx';
import { SaveButton } from './saveAndReset.tsx';
import { plural } from './statusText.ts';
import { UnsavedSheet } from './UnsavedSheet.tsx';

/**
 * App name, whether the work is saved, Save and the ⋯ menu. `onImportNew` is given on the main view: it adds the
 * menu, and while something is unsaved the line becomes an underlined link that opens the list of unsaved changes.
 */
export function AppHeader({ onImportNew }: { onImportNew?: () => void }) {
  const hasProject = useAppSelector(selectHasProject);
  const dirty = useAppSelector(selectIsDirty);
  const unsavedCount = useAppSelector(selectUnsavedAccountCount);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  /** The account opened from the Unsaved changes popup. */
  const [accountKey, setAccountKey] = useState<string | null>(null);

  const indicator = !dirty
    ? 'All decisions saved'
    : unsavedCount
      ? `● Unsaved · ${plural(unsavedCount, 'changed account')}`
      : '● New import not saved';
  const color = dirty ? 'accent' : 'fg.muted';

  return (
    <HStack as="header" h="72px" px="5" justify="space-between" borderBottomWidth="1px" gap="3">
      <Box>
        <Heading textStyle="appName" lineHeight="1">
          Unfollowism
        </Heading>
        {hasProject &&
          (onImportNew && dirty ? (
            <Button
              variant="plain"
              h="auto"
              p="0"
              textStyle="small"
              color={color}
              textDecoration="underline"
              textUnderlineOffset="3px"
              onClick={() => {
                setUnsavedOpen(true);
              }}
            >
              {indicator}
            </Button>
          ) : (
            <Text textStyle="small" color={color}>
              {indicator}
            </Text>
          ))}
      </Box>
      {hasProject && (
        <HStack gap="1.5">
          <SaveButton h="10" />
          {onImportNew && <AppMenu onImportNew={onImportNew} />}
        </HStack>
      )}
      <UnsavedSheet
        open={unsavedOpen}
        onClose={() => {
          setUnsavedOpen(false);
        }}
        onOpenAccount={setAccountKey}
      />
      <AccountSheet
        accountKey={accountKey}
        onClose={() => {
          setAccountKey(null);
        }}
      />
    </HStack>
  );
}
