import { Box, Button, CloseButton, Drawer, HStack, Portal, Stack, Text } from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';

import {
  DecisionKind,
  SESSION_CHANGES,
  usernameKey,
  type Decision,
  type SessionAccountChanges,
  type TagChangeRow,
  selectHasBeenSaved,
  selectIsDirty,
  selectUnsavedAccountCount,
  plural,
} from '@/entities/master';
import { ResetButton, SaveButton } from '@/features/save-reset';
import type { DeepReadonly } from '@/shared/lib/deepReadonly.ts';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';
import { TextButton } from '@/shared/ui/TextButton.tsx';

import { selectUnsavedGroups } from '../model/selectors.ts';

import { changeText, decisionText, tagRowText } from './sessionText.ts';

/** Accounts listed at most; a big tag rename or delete can touch thousands. */
const MAX_ACCOUNTS = 200;
/** Names a tag row shows when opened, before "Show all". */
const FIRST_NAMES = 10;

type OpenAccount = (username: string) => void;

/** Tap area of a name or "Show all" in a tag row: 32 px tall, the lines are 32 px apart (no room for 40). */
const COMPACT_TAP = { h: '8', px: '1.5', mx: '-1.5', my: '0' } as const;

/** A username that opens the account's popup. `compact`: in a tag row's list of names. */
function NameLink({ username, onOpen, compact }: { username: string; onOpen: OpenAccount; compact?: boolean }) {
  return (
    <TextButton
      {...(compact ? COMPACT_TAP : {})}
      wordBreak="break-all"
      whiteSpace="normal"
      textAlign="start"
      onClick={() => {
        onOpen(username);
      }}
    >
      @{username}
    </TextButton>
  );
}

function MoreAccounts({ count }: { count: number }) {
  return count > 0 ? (
    <Text textStyle="small" color="fg.muted">
      and {plural(count, 'more account')}
    </Text>
  ) : null;
}

/** A framed list with 1px lines between its rows, under a small heading. */
function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Stack gap="2">
      <Text as="h3" textStyle="control">
        {title}
      </Text>
      <Stack as="ul" listStyleType="none" gap="0" borderWidth="1px" css={{ '& > li + li': { borderTopWidth: '1px' } }}>
        {children}
      </Stack>
    </Stack>
  );
}

function TagRow({ row, onOpen }: { row: TagChangeRow; onOpen: OpenAccount }) {
  /** null = closed; else how many names are shown. */
  const [shown, setShown] = useState<number | null>(null);
  const count = row.usernames.length;
  const label = tagRowText(row);
  return (
    <Box as="li">
      <Button
        variant="plain"
        w="full"
        h="11"
        px="3"
        justifyContent="space-between"
        fontWeight="400"
        aria-expanded={shown !== null}
        onClick={() => {
          setShown(shown === null ? FIRST_NAMES : null);
        }}
      >
        <Text as="span" truncate>
          {label}
        </Text>
        <Text as="span" color="fg.muted" flexShrink="0">
          {plural(count, 'account')} {shown === null ? '▾' : '▴'}
        </Text>
      </Button>
      {shown !== null && (
        <HStack px="3" pb="2" rowGap="0" columnGap="4" wrap="wrap">
          {row.usernames.slice(0, shown).map(username => (
            <NameLink key={username} username={username} onOpen={onOpen} compact />
          ))}
          {count > shown && shown < MAX_ACCOUNTS && (
            <TextButton
              {...COMPACT_TAP}
              onClick={() => {
                setShown(MAX_ACCOUNTS);
              }}
            >
              Show all {count}
            </TextButton>
          )}
          {shown === MAX_ACCOUNTS && <MoreAccounts count={count - MAX_ACCOUNTS} />}
        </HStack>
      )}
    </Box>
  );
}

/** Kept is black, queued is blue, back to needing a decision is outlined. */
function DecisionChip({ decision }: { decision: DeepReadonly<Decision> | null }) {
  const look =
    decision === null
      ? { borderWidth: '1px' }
      : { bg: decision.kind === DecisionKind.KEPT ? 'ink' : 'accent', color: 'paper' };
  return (
    <Text as="span" textStyle="small" fontWeight="500" px="1.5" py="0.5" {...look}>
      {decisionText(decision)}
    </Text>
  );
}

function AccountBlock({ entry, onOpen }: { entry: SessionAccountChanges; onOpen: OpenAccount }) {
  // The old name of a confirmed rename is no account any more, so there is nothing to open.
  const gone = entry.changes.some(change => change.type === SESSION_CHANGES.ACCOUNT_REMOVED);
  return (
    <Stack as="li" p="3" gap="1.5" align="flex-start">
      {gone ? (
        <Text textStyle="name" wordBreak="break-all">
          @{entry.username}
        </Text>
      ) : (
        <NameLink username={entry.username} onOpen={onOpen} />
      )}
      {entry.changes.map((change, i) =>
        change.type === SESSION_CHANGES.DECISION_CHANGED ? (
          <HStack key={i} gap="2" color="fg.muted" wrap="wrap">
            <span>{decisionText(change.from)}</span>
            <span aria-hidden>→</span>
            <DecisionChip decision={change.to} />
          </HStack>
        ) : (
          <Text key={i} textStyle="small" color="fg.muted">
            {changeText(change)}
          </Text>
        ),
      )}
    </Stack>
  );
}

/** What isn't in the downloaded master yet. Mounted only while the popup is open. */
function UnsavedChanges({ onOpenAccount, onClose }: { onOpenAccount: OpenAccount; onClose: () => void }) {
  const { tagRows, accounts } = useAppSelector(selectUnsavedGroups);
  const changedCount = useAppSelector(selectUnsavedAccountCount);
  const dirty = useAppSelector(selectIsDirty);
  const hasBeenSaved = useAppSelector(selectHasBeenSaved);

  const subtitle = changedCount
    ? `${plural(changedCount, 'changed account')} since ${hasBeenSaved ? 'your last save' : 'adding the data'}`
    : dirty
      ? 'New data, no account changes'
      : 'No edits since your last save.';

  return (
    <>
      <Drawer.Header display="block">
        <Drawer.Title textStyle="heading">Unsaved changes</Drawer.Title>
        <Text textStyle="small" color="fg.muted">
          {subtitle}
        </Text>
      </Drawer.Header>
      <Drawer.Body>
        <Stack gap="4">
          {tagRows.length > 0 && (
            <Section title="Tag changes">
              {tagRows.map(row => (
                <TagRow key={tagRowText(row)} row={row} onOpen={onOpenAccount} />
              ))}
            </Section>
          )}
          {accounts.length > 0 && (
            <Section title="Other changes">
              {accounts.slice(0, MAX_ACCOUNTS).map(entry => (
                <AccountBlock key={entry.username} entry={entry} onOpen={onOpenAccount} />
              ))}
            </Section>
          )}
          <MoreAccounts count={accounts.length - MAX_ACCOUNTS} />
          {dirty && (
            <Text color="fg.muted">Save downloads an updated progress file with these changes. Add it next time.</Text>
          )}
        </Stack>
      </Drawer.Body>
      <Drawer.Footer flexDirection="column" alignItems="stretch" gap="2">
        <SaveButton h="11" onSaved={onClose} />
        <ResetButton h="11" onReset={onClose} />
      </Drawer.Footer>
    </>
  );
}

/** Opens from the header's unsaved line. Tapping a username closes it and opens that account's popup. */
export function UnsavedPopup({
  open,
  onClose,
  onOpenAccount,
}: {
  open: boolean;
  onClose: () => void;
  /** Gets the account key. */
  onOpenAccount: (key: string) => void;
}) {
  return (
    <Drawer.Root
      open={open}
      onOpenChange={e => {
        if (!e.open) {
          onClose();
        }
      }}
      placement="bottom"
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <UnsavedChanges
              onClose={onClose}
              onOpenAccount={username => {
                onClose();
                onOpenAccount(usernameKey(username));
              }}
            />
            <Drawer.CloseTrigger asChild>
              <CloseButton variant="outline" aria-label="Close" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
