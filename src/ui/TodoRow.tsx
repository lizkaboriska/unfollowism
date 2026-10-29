import { memo } from 'react';
import { Badge, Box, Button, HStack, Stack, Text } from '@chakra-ui/react';
import {
  ACTION_TYPES,
  PLAN_STATES,
  followOf,
  planOf,
  relationshipOf,
  type ActionType,
  type PlanState,
} from '../core/index.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { setPlan } from '../store/masterSlice.ts';
import { selectAccount } from '../store/selectors.ts';
import { formatSince } from './dates.ts';
import { RELATIONSHIP_LABELS } from './labels.ts';
import { ProfileLink } from './ProfileLink.tsx';

/**
 * One account in a To do list: open Instagram, do it there, then Mark done (or Keep, after
 * a change of mind). The row stays until the list refreshes, so both can be undone.
 * Its tags are shown to help decide; editing them, notes and review ticks happen on the full card.
 */
export const TodoRow = memo(function TodoRow({ accountKey, type }: { accountKey: string; type: ActionType }) {
  const dispatch = useAppDispatch();
  const account = useAppSelector(s => selectAccount(s, accountKey));
  if (!account) return null;

  const { username } = account;
  const plan = planOf(account, type);
  const set = (state: PlanState | null) => dispatch(setPlan({ username, type, state }));
  const follow = followOf(account, type);
  const followText =
    follow?.since == null
      ? null
      : `${type === ACTION_TYPES.UNFOLLOW ? 'You followed' : 'Followed you'} ${formatSince(follow.since)}`;

  return (
    <Box as="article" aria-label={`@${username}`} borderWidth="1px" borderRadius="lg" bg="white" px="4" py="3">
      <Stack direction={{ base: 'column', sm: 'row' }} gap="2" align={{ base: 'stretch', sm: 'center' }}>
        <Stack gap="0" flex="1" minW="0">
          <ProfileLink username={username} />
          <HStack gap="2" wrap="wrap">
            <Badge>{RELATIONSHIP_LABELS[relationshipOf(account)]}</Badge>
            {followText && (
              <Text fontSize="sm" color="fg.muted">
                {followText}
              </Text>
            )}
            {account.review.tags.map(tag => (
              <Badge key={tag} size="sm" variant="outline" colorPalette="pink">
                {tag}
              </Badge>
            ))}
          </HStack>
        </Stack>
        <HStack gap="2" justify={{ base: 'flex-start', sm: 'flex-end' }}>
          {plan === PLAN_STATES.PLANNED && (
            <>
              <Button size="sm" colorPalette="pink" onClick={() => set(PLAN_STATES.DONE)}>
                Mark done
              </Button>
              <Button size="sm" variant="ghost" onClick={() => set(null)}>
                Keep
              </Button>
            </>
          )}
          {plan === PLAN_STATES.DONE && (
            <>
              <Text color="green.700" fontWeight="medium">
                ✓ Done
              </Text>
              <Button size="sm" variant="ghost" onClick={() => set(PLAN_STATES.PLANNED)}>
                Undo
              </Button>
            </>
          )}
          {plan === undefined && (
            <>
              <Text color="fg.muted">Kept</Text>
              <Button size="sm" variant="ghost" onClick={() => set(PLAN_STATES.PLANNED)}>
                Undo
              </Button>
            </>
          )}
        </HStack>
      </Stack>
    </Box>
  );
});
