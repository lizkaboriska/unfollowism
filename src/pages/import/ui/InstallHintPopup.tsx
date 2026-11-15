import { Button, Dialog, List, Portal, Stack, Text } from '@chakra-ui/react';

import { Step } from './HowItWorksPopup.tsx';

/** Safari's step to add the app (Apple's steps, default layout): ☰ shown bigger, so it reads as the button. */
export function AddToHomeScreenText() {
  return (
    <Text>
      In Safari, tap{' '}
      <Text
        as="span"
        role="img"
        aria-label="the menu button"
        fontSize="21px"
        fontWeight="600"
        lineHeight="1"
        verticalAlign="-2px"
      >
        ☰
      </Text>{' '}
      left of the address → Share → swipe up → Add to Home Screen → keep "Open as Web App" on → Add.
    </Text>
  );
}

/**
 * Before the first import in an iPhone/iPad Safari tab: Safari can clear the work, the Home Screen app keeps it, and
 * nothing moves from the tab into the app. "Got it" (or closing) imports nothing; "Continue in Safari" imports.
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
    <Dialog.Root
      open={isOpen}
      onOpenChange={details => {
        if (!details.open) {
          onAddLater();
        }
      }}
      placement="center"
    >
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content mx="4">
            <Dialog.Header>
              <Dialog.Title textStyle="heading">Before you start: keep your work on iPhone</Dialog.Title>
            </Dialog.Header>
            <Dialog.Body>
              <Stack gap="3">
                <Text>
                  Safari can clear your work if you don't open the site for a week. The Home Screen app keeps it.
                </Text>
                <List.Root as="ol" listStyle="none" gap="2">
                  <Step number={1}>
                    <AddToHomeScreenText />
                  </Step>
                  <Step number={2}>
                    <Text>Open Unfollowism from your Home Screen and choose your .zip there.</Text>
                  </Step>
                </List.Root>
              </Stack>
            </Dialog.Body>
            <Dialog.Footer flexDirection="column" alignItems="stretch" gap="2">
              <Button h="11" onClick={onAddLater}>
                Got it, I'll add it
              </Button>
              <Button h="11" variant="outline" onClick={onContinue}>
                Continue in Safari
              </Button>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
