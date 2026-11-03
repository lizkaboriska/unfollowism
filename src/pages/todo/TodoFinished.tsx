import { Box, Button, Heading, Stack, Text } from '@chakra-ui/react';
import { useId } from 'react';

import { LIST_VIEWS } from '@/entities/master';
import { setView } from '@/features/filters';
import { useAppDispatch } from '@/shared/lib/storeHooks.ts';

/**
 * To do with nothing left: "All done, for now" when plans were done (they can still be viewed and undone until the
 * next import), "Nothing queued" when there were none. `done` is how many plans are done.
 */
export function TodoFinished({ done, onViewCompleted }: { done: number; onViewCompleted: () => void }) {
  const dispatch = useAppDispatch();
  const titleId = useId();
  const backToReview = () => dispatch(setView(LIST_VIEWS.REVIEW));

  if (done === 0) {
    return (
      <Box as="section" aria-labelledby={titleId} borderWidth="1px" px="5" pt="7" pb="5" textAlign="center">
        <Heading as="h2" id={titleId} textStyle="heading">
          Nothing queued
        </Heading>
        <Text color="fg.muted" mt="2.5">
          Queue an unfollow or a removal in Review and it shows up here.
        </Text>
        <Button w="full" mt="4.5" onClick={backToReview}>
          Back to Review
        </Button>
      </Box>
    );
  }

  return (
    <>
      <Box as="section" aria-labelledby={titleId} borderWidth="1px" px="5" pt="7" pb="5" textAlign="center">
        <Heading as="h2" id={titleId} textStyle="heading">
          All done, for now
        </Heading>
        <Text textStyle="note" color="fg.muted" mt="2.5">
          Your queue is clear. A little more room for what you love.
        </Text>
        <Text color="fg.muted" mt="2.5">
          Your next import confirms the changes you made in Instagram.
        </Text>
        <Stack gap="2" mt="4.5">
          <Button variant="outline" onClick={onViewCompleted}>
            View completed · {done}
          </Button>
          <Button variant="outline" onClick={backToReview}>
            Back to Review
          </Button>
        </Stack>
      </Box>
      <Box>
        <Text textStyle="control">Take your progress with you</Text>
        <Text color="fg.muted">Save at the top downloads your updated master file. Keep it for next time.</Text>
      </Box>
    </>
  );
}
