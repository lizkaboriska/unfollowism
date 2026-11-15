import { Button, List, Text } from '@chakra-ui/react';

import { AddToHomeScreenText, HomeScreenPopup } from '@/features/home-screen';
import { Step } from '@/shared/ui/Step.tsx';

/**
 * Before the first import in an iPhone/iPad Safari tab: Safari can clear the work, the Home Screen app keeps it, and
 * nothing moves from the tab into the app. "Got it" (or ×) imports nothing; "Continue in Safari" imports.
 */
export function InstallHintPopup({
  isOpen,
  onAddLater,
  onContinue,
}: {
  isOpen: boolean;
  onAddLater: () => void;
  onContinue: () => void;
}) {
  return (
    <HomeScreenPopup
      isOpen={isOpen}
      title="Before you start: keep your work on iPhone"
      onClose={onAddLater}
      buttons={
        <>
          <Button h="11" onClick={onAddLater}>
            Got it, I'll add it
          </Button>
          <Button h="11" variant="outline" onClick={onContinue}>
            Continue in Safari
          </Button>
        </>
      }
    >
      <Text color="fg.muted">
        Safari can clear your work if you don't open the site for a week. The Home Screen app keeps it.
      </Text>
      <List.Root as="ol" listStyle="none" gap="1.5">
        <Step number={1}>
          <AddToHomeScreenText color="fg.muted" />
        </Step>
        <Step number={2}>
          <Text color="fg.muted">Open Unfollowism from your Home Screen and choose your .zip there.</Text>
        </Step>
      </List.Root>
    </HomeScreenPopup>
  );
}
