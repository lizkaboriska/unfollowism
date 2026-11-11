import { Box, Button, HStack, SimpleGrid, Text, chakra } from '@chakra-ui/react';
import { memo } from 'react';

import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';

import { isKept, isPastAccount } from '../lib/decision.ts';
import { PLAN_STATES, type ReadonlyAccount, type ReviewScope } from '../lib/types.ts';
import { setKept, setPlan } from '../model/masterSlice.ts';
import { selectAccount } from '../model/selectors.ts';

import { planText, queueText, relationshipNote } from './labels.ts';
import { ProfileLink } from './ProfileLink.tsx';
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
function QueueControl({
  account,
  scope,
  onOpen,
}: {
  account: ReadonlyAccount;
  scope: ReviewScope;
  onOpen: () => void;
}) {
  const dispatch = useAppDispatch();
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

/**
 * A Review card: who it is, its tags, and the two decisions. The name opens the Instagram profile; the rest of the
 * card's top (note, →) opens the account popup. `scope` is the list it's shown in, which decides what the queue
 * button offers.
 */
export const ReviewCard = memo(function ReviewCard({
  accountKey,
  scope,
  onOpen,
}: {
  accountKey: string;
  scope: ReviewScope;
  onOpen: (accountKey: string) => void;
}) {
  const account = useAppSelector(state => selectAccount(state, accountKey));
  if (!account) {
    return null;
  }
  const { username, review } = account;
  const open = () => {
    onOpen(accountKey);
  };
  return (
    <Box as="article" aria-label={`@${username}`} borderWidth="1px" p="3" opacity={review.unavailable ? 0.6 : 1}>
      {/* The popup button's ::after covers this whole top area; the name link sits above it (a link can't be inside
          a button). */}
      <Box position="relative" display="flex" alignItems="flex-start" gap="2">
        <Box flex="1" minW="0">
          <HStack gap="2" wrap="wrap">
            <ProfileLink username={username} position="relative" zIndex="1" />
            {review.unavailable && (
              <Text textStyle="small" color="fg.muted">
                Unavailable
              </Text>
            )}
          </HStack>
          <chakra.button
            type="button"
            aria-label={`Open @${username}`}
            display="block"
            textAlign="start"
            cursor="pointer"
            outline="none"
            onClick={open}
            _after={{ content: '""', position: 'absolute', inset: '0' }}
            _focusVisible={{ _after: { outline: '2px solid', outlineColor: 'accent', outlineOffset: '2px' } }}
          >
            <Text textStyle="note" color="fg.muted">
              {relationshipNote(account)}
            </Text>
          </chakra.button>
        </Box>
        <Text aria-hidden>→</Text>
      </Box>
      {review.tags.length > 0 && (
        <Text textStyle="small" color="fg.muted" mt="2">
          {review.tags.map(tag => `#${tag}`).join(' ')}
        </Text>
      )}
      {/* A past account has nothing left to decide. */}
      {!isPastAccount(account) && (
        <SimpleGrid columns={2} gap="2" mt="2">
          <KeepButton account={account} />
          <QueueControl account={account} scope={scope} onOpen={open} />
        </SimpleGrid>
      )}
    </Box>
  );
});
