import { Button, CloseButton, Drawer, HStack, List, Portal, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

import { HowItWorksView } from './howItWorksView.ts';

/** Instagram's page for requesting a copy of your data (Accounts Center → Download your information). */
const EXPORT_URL = 'https://accountscenter.instagram.com/info_and_permissions/dyi/';

const LINK = { variant: 'plain', h: 'auto', p: '0', textDecoration: 'underline', textUnderlineOffset: '3px' } as const;

function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <List.Item display="flex" gap="3">
      <Text as="span" fontFamily="heading" fontSize="md" fontWeight="500" w="3.5" flexShrink="0">
        {number}
      </Text>
      <Stack gap="0" flex="1">
        {children}
      </Stack>
    </List.Item>
  );
}

function Strong({ children }: { children: ReactNode }) {
  return (
    <Text as="b" fontWeight="500">
      {children}
    </Text>
  );
}

/** A setting the user must change from Instagram's default: blue and semibold, so it's easy to find again. */
function MustChange({ children }: { children: ReactNode }) {
  return (
    <Text as="b" fontWeight="600" color="accent">
      {children}
    </Text>
  );
}

function Steps({ onHow }: { onHow: () => void }) {
  return (
    <List.Root as="ol" listStyle="none" gap="3">
      <Step number={1}>
        <HStack justify="space-between" gap="3">
          <Text fontWeight="500">Get your data from Instagram</Text>
          <Button {...LINK} onClick={onHow}>
            How?
          </Button>
        </HStack>
      </Step>
      <Step number={2}>
        <Text fontWeight="500">Add the .zip here</Text>
        <Text color="fg.muted">As it is, no need to unzip.</Text>
      </Step>
      <Step number={3}>
        <Text fontWeight="500">Decide who stays</Text>
        <Text color="fg.muted">
          Review accounts and choose who to unfollow. You'll get a to-do list to follow in Instagram.
        </Text>
      </Step>
      <Step number={4}>
        <Text fontWeight="500">Save your progress</Text>
        <Text color="fg.muted">
          Keep your tags, notes, and choices. Next time, add your progress file with fresh Instagram data to see who
          unfollowed you.
        </Text>
      </Step>
    </List.Root>
  );
}

function ExportSteps() {
  return (
    <Stack gap="3">
      <Button asChild variant="outline" h="11">
        <a href={EXPORT_URL} target="_blank" rel="noreferrer">
          Open Accounts Center <span aria-hidden="true">↗</span>
        </a>
      </Button>
      <Text color="fg.muted">
        Or in Instagram: Settings → Accounts Center → Your information and permissions → Export your information
      </Text>
      <List.Root as="ol" listStyle="none" gap="3" pt="3" borderTopWidth="1px">
        <Step number={1}>
          <Text>
            Tap <Strong>Create export</Strong>, then pick your Instagram profile.
          </Text>
        </Step>
        <Step number={2}>
          <Text>
            Choose <Strong>Export to device</Strong>.
          </Text>
        </Step>
        <Step number={3}>
          <Text>Change these three:</Text>
          <Text>
            Customize information: <MustChange>only Followers and following</MustChange>
          </Text>
          <Text>
            Date range: <MustChange>All time</MustChange>{' '}
            <Text as="span" color="fg.muted">
              (not Last year)
            </Text>
          </Text>
          <Text>
            Format: <MustChange>JSON</MustChange>{' '}
            <Text as="span" color="fg.muted">
              (not HTML)
            </Text>
          </Text>
        </Step>
        <Step number={4}>
          <Text>
            Tap <Strong>Start export</Strong>.
          </Text>
        </Step>
        <Step number={5}>
          <Text>
            Instagram emails you when it's ready, usually within minutes to a few hours. Download the .zip within four
            days, and come back.
          </Text>
        </Step>
      </List.Root>
    </Stack>
  );
}

/** How the app works in four steps, and how to get the Instagram data. `view` null = closed. */
export function HowItWorksPopup({
  view,
  onView,
  onClose,
}: {
  view: HowItWorksView | null;
  onView: (view: HowItWorksView) => void;
  onClose: () => void;
}) {
  return (
    <Drawer.Root
      open={view !== null}
      onOpenChange={details => {
        if (!details.open) {
          onClose();
        }
      }}
      placement="bottom"
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header flexDirection="column" alignItems="flex-start" gap="3">
              {view === HowItWorksView.EXPORT && (
                <Button
                  {...LINK}
                  onClick={() => {
                    onView(HowItWorksView.STEPS);
                  }}
                >
                  <span aria-hidden="true">← </span>How it works
                </Button>
              )}
              <Drawer.Title textStyle="heading">
                {view === HowItWorksView.EXPORT ? 'Get your Instagram data' : 'How it works'}
              </Drawer.Title>
            </Drawer.Header>
            <Drawer.Body>
              {view === HowItWorksView.EXPORT ? (
                <ExportSteps />
              ) : (
                <Steps
                  onHow={() => {
                    onView(HowItWorksView.EXPORT);
                  }}
                />
              )}
            </Drawer.Body>
            <Drawer.Footer flexDirection="column" alignItems="stretch">
              <Button h="11" onClick={onClose}>
                Got it
              </Button>
            </Drawer.Footer>
            <Drawer.CloseTrigger asChild>
              <CloseButton variant="outline" aria-label="Close" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
