import { Box, Button, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { useId, useState } from 'react';

import { PAGE_WIDTH } from '@/shared/ui/pageWidth.ts';

/**
 * Shown instead of the app when it already works in another tab: the app runs in one tab at a time. Use here moves
 * the work to this tab (`onUseHere` takes over and starts the app).
 */
export function OtherTabScreen({ onUseHere }: { onUseHere: () => Promise<void> }) {
  const boxTitleId = useId();
  const [taking, setTaking] = useState(false);
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
            Open in another tab
          </Heading>
          <Text color="fg.muted">Unfollowism works in one tab at a time, so your work can't get mixed up.</Text>
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
              Work in this tab?
            </Heading>
            <Text color="fg.muted">Your work moves here, unsaved changes too. The other tab stops.</Text>
            <Button
              w="full"
              mt="2"
              loading={taking}
              onClick={() => {
                setTaking(true);
                void onUseHere();
              }}
            >
              Use here
            </Button>
          </Stack>
        </Box>
      </Box>
    </Box>
  );
}
