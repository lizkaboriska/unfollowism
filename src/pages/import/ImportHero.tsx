import { Box, Button, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { useId, useState } from 'react';

import { PAGE_WIDTH } from '@/shared/ui/pageWidth.ts';

import { HowItWorksPopup } from './HowItWorksPopup.tsx';
import type { HowItWorksSeen } from './howItWorksSeen.ts';
import { HowItWorksView } from './howItWorksView.ts';

/**
 * The top of the Welcome and Import screen, the same in every state: app name, slogan, what the app does, the privacy
 * promise, and the How it works button (the four steps and how to get the Instagram data, in a popup).
 * On a first visit (`firstVisit`: no work loaded) the popup opens by itself, until this browser has closed it once.
 */
export function ImportHero({ seen, firstVisit }: { seen: HowItWorksSeen; firstVisit: boolean }) {
  const [view, setView] = useState<HowItWorksView | null>(() =>
    firstVisit && !seen.get() ? HowItWorksView.STEPS : null,
  );
  const privacyTitleId = useId();
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
            Keep your feed fun. Keep your people intentional.
          </Heading>
          <Text color="fg.muted">
            See who follows you back, organize accounts with tags and notes, and decide who to unfollow.
          </Text>
        </Stack>
        <Stack gap="5" px="5" pt="5">
          <Stack as="section" aria-labelledby={privacyTitleId} gap="1" borderWidth="1px" px="4" py="3">
            <Heading as="h2" id={privacyTitleId} textStyle="control">
              Private by design
            </Heading>
            <Text color="fg.muted">
              No login. Your files are read in your browser and never uploaded. Nothing connects to Instagram: you
              unfollow people and remove followers yourself, in the Instagram app.
            </Text>
          </Stack>
          <Button
            colorPalette="accent"
            w="full"
            h="11"
            onClick={() => {
              setView(HowItWorksView.STEPS);
            }}
          >
            How it works
          </Button>
        </Stack>
      </Box>
      <HowItWorksPopup
        view={view}
        onView={setView}
        onClose={() => {
          setView(null);
          seen.set();
        }}
      />
    </Box>
  );
}
