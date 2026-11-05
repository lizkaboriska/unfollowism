import { Button, HStack, Stack, Text } from '@chakra-ui/react';

import {
  confirmRename,
  dismissRename,
  ProfileLink,
  RenameMatch,
  RenameState,
  selectAccount,
  undoRename,
  type RenamePair,
} from '@/entities/master';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';

/** Why the two names look like one account. */
const MATCH_TEXT: Record<RenameMatch, string> = {
  [RenameMatch.BOTH]: 'Followed each other, same dates.',
  [RenameMatch.FOLLOWING]: 'You followed them, same date.',
  [RenameMatch.FOLLOWER]: 'They followed you, same date.',
};

/** What was decided, on a decided pair. */
const DECIDED_TEXT: Record<Exclude<RenameState, RenameState.WAITING>, string> = {
  [RenameState.MOVED]: '✓ Moved',
  [RenameState.NOT_RENAME]: '✓ Not a rename',
};

/**
 * One suggested rename on Changes: the old name, → the new one (both open the profile), and either the choice (move
 * the review work to the new name, or not a rename) or what was decided, with Undo until the next save.
 */
export function RenamePairRow({ pair }: { pair: RenamePair }) {
  const dispatch = useAppDispatch();
  // The old account is gone once moved: its name is kept in the imported data, like the new one's.
  const fromName = useAppSelector(s => s.master.base?.accounts[pair.from]?.username);
  const toName = useAppSelector(s => selectAccount(s, pair.to)?.username);
  if (fromName === undefined || toName === undefined) {
    return null;
  }
  const waiting = pair.state === RenameState.WAITING;

  return (
    <Stack
      as="li"
      aria-label={`@${fromName} to @${toName}`}
      listStyleType="none"
      p="3"
      gap="2"
      _notFirst={{ borderTopWidth: '1px' }}
    >
      <Stack gap="0.5" align="start">
        <ProfileLink username={fromName} />
        <Text textStyle="name" wordBreak="break-all">
          <Text as="span" aria-hidden>
            →{' '}
          </Text>
          <ProfileLink username={toName} />
        </Text>
        {waiting && <Text color="fg.muted">{MATCH_TEXT[pair.match]}</Text>}
      </Stack>
      {pair.state === RenameState.WAITING ? (
        <HStack justify="space-between" gap="2">
          <Button variant="outline" h="10" onClick={() => dispatch(confirmRename({ from: pair.from }))}>
            Move to new name
          </Button>
          <Button
            variant="plain"
            h="10"
            px="2"
            me="-2"
            textDecoration="underline"
            textUnderlineOffset="3px"
            onClick={() => dispatch(dismissRename({ from: pair.from }))}
          >
            Not a rename
          </Button>
        </HStack>
      ) : (
        <HStack justify="space-between" gap="2" minH="10">
          <Text color="fg.muted">{DECIDED_TEXT[pair.state]}</Text>
          {pair.undoable && (
            <Button
              variant="plain"
              h="10"
              px="2"
              me="-2"
              textDecoration="underline"
              textUnderlineOffset="3px"
              onClick={() => dispatch(undoRename({ from: pair.from }))}
            >
              Undo
            </Button>
          )}
        </HStack>
      )}
    </Stack>
  );
}
