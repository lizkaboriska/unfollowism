import { Box, Button, HStack, SimpleGrid, Stack, Text, chakra } from '@chakra-ui/react';
import { memo } from 'react';

import {
  PLAN_STATES,
  planOf,
  profileUrl,
  type ActionType,
  type PlanState,
  setPlan,
  selectAccount,
  openProfilePopup,
  relationshipNote,
} from '@/entities/master';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';
import { TextButton } from '@/shared/ui/TextButton.tsx';

/**
 * A row you finished, folded to one gray line: name (crossed out when done; not when kept, nothing was unfollowed),
 * "✓ Done" or "Kept", Undo back to queued, → opens the popup.
 */
function SettledRow({
  username,
  isDone,
  onUndo,
  onOpen,
}: {
  username: string;
  isDone: boolean;
  onUndo: () => void;
  onOpen: () => void;
}) {
  return (
    <HStack as="article" aria-label={`@${username}`} borderWidth="1px" minH="52px" px="3" gap="2" color="fg.muted">
      <Text
        textStyle="name"
        wordBreak="break-all"
        textDecoration={isDone ? 'line-through' : 'none'}
        textDecorationThickness="1px"
      >
        @{username}
      </Text>
      <Text textStyle="control" flexShrink="0">
        {isDone ? '✓ Done' : 'Kept'}
      </Text>
      <Box flex="1" />
      <TextButton color="fg.muted" onClick={onUndo}>
        Undo
      </TextButton>
      <chakra.button
        type="button"
        aria-label={`Open @${username}`}
        w="10"
        h="10"
        me="-2"
        flexShrink="0"
        cursor="pointer"
        onClick={onOpen}
      >
        <span aria-hidden>→</span>
      </chakra.button>
    </HStack>
  );
}

/**
 * One account in a To do tab: open Instagram, make the change there, then Mark done. The top of the card opens the
 * account popup (decisions, tags, notes; Keep there drops the plan). Done and Kept fold to one line and stay where
 * they are until the tab's list refreshes, so they can be undone.
 */
export const TodoRow = memo(function TodoRow({
  accountKey,
  type,
  onOpen,
}: {
  accountKey: string;
  type: ActionType;
  onOpen: (accountKey: string) => void;
}) {
  const dispatch = useAppDispatch();
  const account = useAppSelector(state => selectAccount(state, accountKey));
  if (!account) {
    return null;
  }

  const { username } = account;
  const plan = planOf(account, type);
  const set = (state: PlanState) => dispatch(setPlan({ username, type, state }));
  const undo = () => set(PLAN_STATES.PLANNED);
  if (plan !== PLAN_STATES.PLANNED) {
    // Keep in the popup dropped the plan (undefined): the row stays as Kept until the list refreshes.
    return (
      <SettledRow
        username={username}
        isDone={plan === PLAN_STATES.DONE}
        onUndo={undo}
        onOpen={() => {
          onOpen(accountKey);
        }}
      />
    );
  }

  return (
    <Box as="article" aria-label={`@${username}`} borderWidth="1px">
      <chakra.button
        type="button"
        aria-label={`Open @${username}`}
        display="flex"
        w="full"
        alignItems="flex-start"
        gap="2"
        px="3"
        pt="3"
        textAlign="start"
        cursor="pointer"
        onClick={() => {
          onOpen(accountKey);
        }}
      >
        <Box flex="1" minW="0">
          <Text textStyle="name" wordBreak="break-all">
            @{username}
          </Text>
          <Text textStyle="note" color="fg.muted">
            {relationshipNote(account)}
          </Text>
        </Box>
        <Text aria-hidden>→</Text>
      </chakra.button>
      <Stack gap="2" px="3" pt="2" pb="3">
        {account.review.tags.length > 0 && (
          <Text textStyle="small" color="fg.muted">
            {account.review.tags.map(tag => `#${tag}`).join(' ')}
          </Text>
        )}
        <SimpleGrid columns={2} gap="2">
          <Button asChild variant="outline">
            <a href={profileUrl(username)} target="_blank" rel="noopener noreferrer" onClick={openProfilePopup}>
              Open in Instagram ↗
            </a>
          </Button>
          <Button variant="outline" onClick={() => set(PLAN_STATES.DONE)}>
            ✓ Mark done
          </Button>
        </SimpleGrid>
      </Stack>
    </Box>
  );
});
