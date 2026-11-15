import { Box, Button, CloseButton, Heading, Text } from '@chakra-ui/react';
import { useId, useState } from 'react';

import { isIosSafariTab } from '@/shared/lib/ios.ts';
import type { SeenFlag } from '@/shared/lib/seenFlag.ts';

import { HomeScreenPopup } from './HomeScreenPopup.tsx';
import { HomeScreenSteps } from './HomeScreenSteps.tsx';

const LINK = { variant: 'plain', h: 'auto', p: '0', textDecoration: 'underline', textUnderlineOffset: '3px' } as const;

/**
 * On Review in an iPhone/iPad Safari tab: Safari can clear the work, the Home Screen app keeps it. How? opens the
 * steps. Shown to everyone there, also after "Continue in Safari", until its × (`closed`, remembered in this browser).
 */
export function InstallNotice({ closed }: { closed: SeenFlag }) {
  const [isClosed, setClosed] = useState(() => closed.get());
  const [isStepsOpen, setStepsOpen] = useState(false);
  const titleId = useId();
  if (isClosed || !isIosSafariTab()) {
    return null;
  }
  return (
    <Box as="section" aria-labelledby={titleId} position="relative" borderWidth="1px" p="4" pe="12">
      <Heading as="h2" id={titleId} textStyle="control" mb="1">
        Keep your work on iPhone
      </Heading>
      <Text color="fg.muted">
        Safari can clear your work if you don't open the site for a week. The Home Screen app keeps it.{' '}
        <Button
          {...LINK}
          color="fg"
          verticalAlign="baseline"
          onClick={() => {
            setStepsOpen(true);
          }}
        >
          How?
        </Button>
      </Text>
      <CloseButton
        position="absolute"
        top="1"
        right="1"
        aria-label="Close"
        onClick={() => {
          closed.set();
          setClosed(true);
        }}
      />
      <HomeScreenPopup
        isOpen={isStepsOpen}
        title="Keep your work on iPhone"
        onClose={() => {
          setStepsOpen(false);
        }}
        buttons={
          <Button
            h="11"
            onClick={() => {
              setStepsOpen(false);
            }}
          >
            Got it
          </Button>
        }
      >
        <HomeScreenSteps />
      </HomeScreenPopup>
    </Box>
  );
}
