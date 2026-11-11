import { Box, Text, chakra } from '@chakra-ui/react';
import { memo } from 'react';

import {
  ACTION_TYPES,
  FOLLOW_CHANGES,
  planOf,
  type ActionType,
  type FollowChange,
  type ReadonlyAccount,
  isKept,
  selectAccount,
  selectWasPlanDoneBeforeImport,
  COMPLETED_PLAN_BADGES,
  planText,
} from '@/entities/master';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

/** The plan whose completion explains why an account is in a change list. */
const EXPLAINED_BY: Partial<Record<FollowChange, ActionType>> = {
  [FOLLOW_CHANGES.UNFOLLOWED]: ACTION_TYPES.UNFOLLOW,
  [FOLLOW_CHANGES.LOST_FOLLOWERS]: ACTION_TYPES.REMOVE_FOLLOWER,
};

/**
 * A queued decision as a row shows it ("Unfollow queued", "Both queued"): work still waiting in To do. Null
 * otherwise: Kept shows quietly instead, and an undecided row shows nothing.
 */
function queuedText(account: ReadonlyAccount): string | null {
  const queued = Object.values(ACTION_TYPES).flatMap(type => {
    const state = planOf(account, type);
    return state === undefined ? [] : [planText(type, state)];
  });
  return queued.length > 1 ? 'Both queued' : (queued[0] ?? null);
}

/**
 * One account on the Changes page: name, why it's here when a plan did it, a queued plan or a quiet Kept, → opens
 * its popup.
 */
export const ChangeRow = memo(function ChangeRow({
  accountKey,
  change,
  onOpen,
}: {
  accountKey: string;
  change: FollowChange;
  onOpen: (accountKey: string) => void;
}) {
  const account = useAppSelector(state => selectAccount(state, accountKey));
  const explainedBy = EXPLAINED_BY[change];
  const wasDoneBeforeImport = useAppSelector(
    state => explainedBy !== undefined && selectWasPlanDoneBeforeImport(state, accountKey, explainedBy),
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
        {wasDoneBeforeImport && explainedBy !== undefined && (
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
        {!queued && isKept(account) && (
          <Text textStyle="small" fontWeight="500" py="0.5" flexShrink="0" color="fg.muted">
            ✓ Kept
          </Text>
        )}
        <Text aria-hidden>→</Text>
      </chakra.button>
    </Box>
  );
});
