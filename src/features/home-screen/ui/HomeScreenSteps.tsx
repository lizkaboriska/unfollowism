import { List, Text } from '@chakra-ui/react';

import { Step } from '@/shared/ui/Step.tsx';

import { AddToHomeScreenText } from './AddToHomeScreenText.tsx';

/** Moving to the Home Screen app, which starts empty: back up, add it, add the files there. Grey, as extra help. */
export function HomeScreenSteps() {
  return (
    <>
      <Text color="fg.muted">
        Safari can clear your work if you don't open the site for a week. The Home Screen app keeps it, but starts
        empty:
      </Text>
      <List.Root as="ol" listStyle="none" gap="1.5">
        <Step number={1}>
          <Text color="fg.muted">Back up, if you already have work here.</Text>
        </Step>
        <Step number={2}>
          <AddToHomeScreenText color="fg.muted" />
        </Step>
        <Step number={3}>
          <Text color="fg.muted">
            Open Unfollowism from your Home Screen and add your .zip, and your progress file if you backed up.
          </Text>
        </Step>
      </List.Root>
    </>
  );
}
