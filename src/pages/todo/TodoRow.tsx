import { Box, Button, HStack, SimpleGrid, Text } from '@chakra-ui/react';
import { memo, type ReactNode } from 'react';

import {
  PLAN_STATES,
  planOf,
  profileUrl,
  type ActionType,
  type PlanState,
  keepInstead,
  setPlan,
  selectAccount,
  openProfilePopup,
  relationshipNote,
} from '@/entities/master';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';

/** An underlined text button: "Keep instead", "Undo". */
function TextButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button
      variant="plain"
      h="auto"
      p="0"
      textStyle="body"
      textDecoration="underline"
      textUnderlineOffset="3px"
      _hover={{ color: 'accent' }}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}

/** "✓ Done · Undo" or "Kept · Undo": what happened to the row, and the way back to queued. */
function Settled({ label, onUndo }: { label: string; onUndo: () => void }) {
  return (
    <HStack gap="2" flexShrink="0">
      <Text textStyle="control">{label}</Text>
      <TextButton onClick={onUndo}>Undo</TextButton>
    </HStack>
  );
}

/**
 * One account in a To do tab: open Instagram, make the change there, then Mark done (or Keep instead, after a change
 * of mind). The row stays where it is until the tab's list refreshes, so both can be undone. Decisions, tags and
 * notes are edited in Review.
 */
export const TodoRow = memo(function TodoRow({ accountKey, type }: { accountKey: string; type: ActionType }) {
  const dispatch = useAppDispatch();
  const account = useAppSelector(s => selectAccount(s, accountKey));
  if (!account) {
    return null;
  }

  const { username } = account;
  const plan = planOf(account, type);
  const set = (state: PlanState) => dispatch(setPlan({ username, type, state }));
  const undo = () => set(PLAN_STATES.PLANNED);

  return (
    <Box as="article" aria-label={`@${username}`} borderWidth="1px" p="3">
      <HStack justify="space-between" align="flex-start" gap="2">
        <Box minW="0">
          <Text textStyle="name" wordBreak="break-all">
            @{username}
          </Text>
          <Text textStyle="note" color="fg.muted">
            {relationshipNote(account)}
          </Text>
        </Box>
        {plan === PLAN_STATES.PLANNED && (
          <TextButton onClick={() => dispatch(keepInstead({ username, type }))}>Keep instead</TextButton>
        )}
        {plan === PLAN_STATES.DONE && <Settled label="✓ Done" onUndo={undo} />}
        {/* "Keep instead" dropped the plan: the row stays until the list refreshes, so it can be undone. */}
        {plan === undefined && <Settled label="Kept" onUndo={undo} />}
      </HStack>
      {account.review.tags.length > 0 && (
        <Text textStyle="small" color="fg.muted" mt="2">
          {account.review.tags.map(tag => `#${tag}`).join(' ')}
        </Text>
      )}
      {plan === PLAN_STATES.PLANNED && (
        <SimpleGrid columns={2} gap="2" mt="2">
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
    </Box>
  );
});
