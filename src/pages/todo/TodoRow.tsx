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

/** "✓ Done · Undo" or "Kept · Undo": what happened to the row, and the way back to queued. */
function Settled({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <HStack gap="2" minH="10">
      <Text textStyle="control">{label}</Text>
      <Box flex="1" />
      <TextButton onClick={onUndo}>Undo</TextButton>
    </HStack>
  );
}

/**
 * One account in a To do tab: open Instagram, make the change there, then Mark done. The top of the card opens the
 * account popup (decisions, tags, notes; Keep there drops the plan). The row stays where it is until the tab's list
 * refreshes, so Done and Kept can be undone.
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
        {plan === PLAN_STATES.PLANNED && (
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
        )}
        {plan === PLAN_STATES.DONE && <Settled label="✓ Done" onUndo={undo} />}
        {/* Keep in the popup dropped the plan: the row stays until the list refreshes, so it can be undone. */}
        {plan === undefined && <Settled label="Kept" onUndo={undo} />}
      </Stack>
    </Box>
  );
});
