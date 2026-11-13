import { Box, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { useId } from 'react';

import { SaveButton } from '@/features/save-reset';
import { PAGE_WIDTH } from '@/shared/ui/pageWidth.ts';

/**
 * Shown instead of the app in a tab that another tab took over while this tab's unsaved work wasn't stored (browser
 * storage off or failing), so it couldn't move: Save progress file is the only way to keep it.
 */
export function TabStoppedScreen() {
  const boxTitleId = useId();
  return (
    <Box>
      <Box as="header" borderBottomWidth="1px">
        <HStack maxW={PAGE_WIDTH} mx="auto" h="72px" px="5" pt="4">
          <Heading textStyle="appName" lineHeight="1">
            Unfollowism
          </Heading>
        </HStack>
      </Box>
      <Box maxW={PAGE_WIDTH} mx="auto">
        <Stack gap="3" px="5" pt="6">
          <Heading as="h1" textStyle="title" lineHeight="1.05" textWrap="balance">
            This tab stopped
          </Heading>
          <Text color="fg.muted">You're working in another tab now.</Text>
        </Stack>
        <Box p="5">
          <Stack
            as="section"
            aria-labelledby={boxTitleId}
            gap="2"
            align="center"
            borderWidth="1px"
            px="5"
            pt="6"
            pb="5"
            textAlign="center"
          >
            <Heading as="h2" id={boxTitleId} textStyle="heading">
              Back up your work here
            </Heading>
            <Text color="fg.muted">
              This browser couldn't store your latest changes, so they didn't move. Back up to a progress file, then add
              it in the other tab.
            </Text>
            <SaveButton w="full" mt="2">
              Back up
            </SaveButton>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
