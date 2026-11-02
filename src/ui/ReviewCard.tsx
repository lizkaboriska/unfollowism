import { Box, Button, HStack, SimpleGrid, Text, chakra } from '@chakra-ui/react';
import { memo } from 'react';

import { PLAN_STATES, isKept, isPastAccount, type ReadonlyAccount } from '@/entities/master/lib/index.ts';
import { setKept, setPlan } from '@/entities/master/model/masterSlice.ts';
import { selectAccount } from '@/entities/master/model/selectors.ts';

import { useAppDispatch, useAppSelector } from '../store/hooks.ts';

import { planText, queueText, relationshipNote } from './labels.ts';
import { QueueButtonKind, queueButton } from './queueButton.ts';

/** Keep / ✓ Kept: black once kept; tapping it again takes the decision back. */
export function KeepButton({ account }: { account: ReadonlyAccount }) {
  const dispatch = useAppDispatch();
  const kept = isKept(account);
  return (
    <Button
      variant={kept ? 'solid' : 'outline'}
      aria-pressed={kept}
      onClick={() => dispatch(setKept({ username: account.username, kept: !kept }))}
    >
      {kept ? '✓ Kept' : 'Keep'}
    </Button>
  );
}

/** The card's queue button (see queueButton.ts): queued plans are blue. */
function QueueControl({ account, onOpen }: { account: ReadonlyAccount; onOpen: () => void }) {
  const dispatch = useAppDispatch();
  const scope = useAppSelector(s => s.filters.scope);
  const button = queueButton(account, scope);
  if (button === null) {
    return null;
  }
  const { username } = account;
  if (button.kind === QueueButtonKind.OFFER) {
    return (
      <Button
        variant="outline"
        aria-pressed={false}
        onClick={() => dispatch(setPlan({ username, type: button.type, state: PLAN_STATES.PLANNED }))}
      >
        {queueText(button.type)}
      </Button>
    );
  }
  return (
    <Button
      colorPalette="accent"
      aria-pressed
      onClick={
        button.kind === QueueButtonKind.BOTH
          ? onOpen
          : () => dispatch(setPlan({ username, type: button.type, state: null }))
      }
    >
      ✓ {button.kind === QueueButtonKind.BOTH ? 'Both queued' : planText(button.type, button.state)}
    </Button>
  );
}

/** A Review card: who it is, its tags, and the two decisions. The name or → opens the account sheet. */
export const ReviewCard = memo(function ReviewCard({
  accountKey,
  onOpen,
}: {
  accountKey: string;
  onOpen: (accountKey: string) => void;
}) {
  const account = useAppSelector(s => selectAccount(s, accountKey));
  if (!account) {
    return null;
  }
  const { username, review } = account;
  const open = () => {
    onOpen(accountKey);
  };
  return (
    <Box as="article" aria-label={`@${username}`} borderWidth="1px" p="3" opacity={review.unavailable ? 0.6 : 1}>
      <chakra.button
        type="button"
        aria-label={`Open @${username}`}
        display="flex"
        w="full"
        textAlign="start"
        cursor="pointer"
        alignItems="flex-start"
        gap="2"
        onClick={open}
      >
        <Box flex="1" minW="0">
          <HStack gap="2" wrap="wrap">
            <Text textStyle="name" wordBreak="break-all">
              @{username}
            </Text>
            {review.unavailable && (
              <Text textStyle="small" color="fg.muted">
                Unavailable
              </Text>
            )}
          </HStack>
          <Text textStyle="note" color="fg.muted">
            {relationshipNote(account)}
          </Text>
        </Box>
        <Text aria-hidden>→</Text>
      </chakra.button>
      {review.tags.length > 0 && (
        <Text textStyle="small" color="fg.muted" mt="2">
          {review.tags.map(tag => `#${tag}`).join(' ')}
        </Text>
      )}
      {/* A past account has nothing left to decide. */}
      {!isPastAccount(account) && (
        <SimpleGrid columns={2} gap="2" mt="2.5">
          <KeepButton account={account} />
          <QueueControl account={account} onOpen={open} />
        </SimpleGrid>
      )}
    </Box>
  );
});
