import { Box, Text, chakra } from '@chakra-ui/react';
import { memo } from 'react';

import {
  ACTION_TYPES,
  FOLLOW_CHANGES,
  planOf,
  type ActionType,
  type FollowChange,
  type ReadonlyAccount,
} from '@/entities/master/lib/index.ts';
import { selectAccount } from '@/entities/master/model/selectors.ts';

import { useAppSelector } from '../store/hooks.ts';

import { COMPLETED_PLAN_BADGES, planText } from './labels.ts';
import { RenameSuggestion } from './RenameSuggestion.tsx';

/** The plan whose completion explains why an account is in a change list. */
const EXPLAINED_BY: Partial<Record<FollowChange, ActionType>> = {
  [FOLLOW_CHANGES.UNFOLLOWED]: ACTION_TYPES.UNFOLLOW,
  [FOLLOW_CHANGES.LOST_FOLLOWERS]: ACTION_TYPES.REMOVE_FOLLOWER,
};

/**
 * A queued decision as a row shows it ("Unfollow queued", "Both queued"): work still waiting in To do. Null
 * otherwise: Kept means nothing to do, so on Changes it would only be noise.
 */
function queuedText(account: ReadonlyAccount): string | null {
  const queued = Object.values(ACTION_TYPES).flatMap(type => {
    const state = planOf(account, type);
    return state === undefined ? [] : [planText(type, state)];
  });
  return queued.length > 1 ? 'Both queued' : (queued[0] ?? null);
}

/** One account on the Changes page: name, why it's here when a plan did it, a queued plan, → opens its sheet. */
export const ChangeRow = memo(function ChangeRow({
  accountKey,
  change,
  onOpen,
}: {
  accountKey: string;
  change: FollowChange;
  onOpen: (accountKey: string) => void;
}) {
  const account = useAppSelector(s => selectAccount(s, accountKey));
  const explainedBy = EXPLAINED_BY[change];
  const done = useAppSelector(
    s => explainedBy !== undefined && !!s.master.importFacts?.completedPlans[accountKey]?.includes(explainedBy),
  );
  if (!account) {
    return null;
  }
  const queued = queuedText(account);
  return (
    <Box as="li" aria-label={`@${account.username}`} listStyleType="none" _notFirst={{ borderTopWidth: '1px' }}>
      <chakra.button
        type="button"
        aria-label={`Open @${account.username}`}
        display="flex"
        w="full"
        minH="52px"
        px="3"
        gap="2"
        alignItems="center"
        textAlign="start"
        cursor="pointer"
        onClick={() => {
          onOpen(accountKey);
        }}
      >
        <Text textStyle="name" wordBreak="break-all">
          @{account.username}
        </Text>
        {done && explainedBy !== undefined && (
          <Text textStyle="small" color="fg.muted" flexShrink="0">
            {COMPLETED_PLAN_BADGES[explainedBy]}
          </Text>
        )}
        <Box flex="1" />
        {queued && (
          <Text textStyle="small" fontWeight="500" px="1.5" py="0.5" flexShrink="0" bg="accent" color="paper">
            {queued}
          </Text>
        )}
        <Text aria-hidden>→</Text>
      </chakra.button>
      {change === FOLLOW_CHANGES.LOST_FOLLOWERS && <RenameSuggestion accountKey={accountKey} />}
    </Box>
  );
});
