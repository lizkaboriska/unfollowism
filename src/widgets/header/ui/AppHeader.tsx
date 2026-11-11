import { Box, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { useState } from 'react';

import { selectIsDirty, selectUnsavedAccountCount } from '@/entities/master';
import { AccountPopup } from '@/features/account-popup';
import { SaveButton } from '@/features/save-reset';
import { plural } from '@/shared/lib/plural.ts';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';
import { PAGE_WIDTH } from '@/shared/ui/pageWidth.ts';
import { TextButton } from '@/shared/ui/TextButton.tsx';

import { AppMenu } from './AppMenu.tsx';
import { UnsavedPopup } from './UnsavedPopup.tsx';

/**
 * The main view's header (the Import screen has ImportHero): app name, whether the work is saved, Save and the ⋯ menu.
 * While something is unsaved the line is an underlined link that opens the list of unsaved changes.
 */
export function AppHeader({ onImportNew }: { onImportNew: () => void }) {
  const dirty = useAppSelector(selectIsDirty);
  const unsavedCount = useAppSelector(selectUnsavedAccountCount);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  /** The account opened from the Unsaved changes popup. */
  const [accountKey, setAccountKey] = useState<string | null>(null);

  const indicator = !dirty
    ? 'All decisions saved'
    : unsavedCount
      ? `● Unsaved · ${plural(unsavedCount, 'changed account')}`
      : '● New data not saved';
  const color = dirty ? 'accent' : 'fg.muted';

  return (
    <Box as="header" borderBottomWidth="1px">
      <HStack maxW={PAGE_WIDTH} mx="auto" h="72px" px="5" justify="space-between" gap="3">
        <Stack gap="0" align="flex-start">
          <Heading textStyle="appName" lineHeight="1">
            Unfollowism
          </Heading>
          {dirty ? (
            // 11 px text: 13 + 14 px of the 40 px tap area hang above and below it.
            <TextButton
              textStyle="small"
              color={color}
              mt="-13px"
              mb="-14px"
              onClick={() => {
                setUnsavedOpen(true);
              }}
            >
              {indicator}
            </TextButton>
          ) : (
            <Text textStyle="small" color={color}>
              {indicator}
            </Text>
          )}
        </Stack>
        <HStack gap="1.5">
          <SaveButton h="10" />
          <AppMenu onImportNew={onImportNew} />
        </HStack>
        <UnsavedPopup
          open={unsavedOpen}
          onClose={() => {
            setUnsavedOpen(false);
          }}
          onOpenAccount={setAccountKey}
        />
        <AccountPopup
          accountKey={accountKey}
          onClose={() => {
            setAccountKey(null);
          }}
        />
      </HStack>
    </Box>
  );
}
