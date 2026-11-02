import { Box, Button, CloseButton, Drawer, HStack, Portal, Stack, Text } from '@chakra-ui/react';
import { useState, type ReactNode } from 'react';

import {
  DecisionKind,
  SESSION_CHANGES,
  usernameKey,
  type Decision,
  type SessionAccountChanges,
  type TagChangeRow,
} from '@/entities/master/lib/index.ts';
import { selectIsDirty, selectUnsavedAccountCount } from '@/entities/master/model/selectors.ts';
import { plural } from '@/entities/master/ui/statusText.ts';
import { ResetButton } from '@/features/save-reset/ResetButton.tsx';
import { SaveButton } from '@/features/save-reset/SaveButton.tsx';
import type { DeepReadonly } from '@/shared/lib/deepReadonly.ts';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

import { selectUnsavedGroups } from '../model/selectors.ts';

import { changeText, decisionText, tagRowText } from './sessionText.ts';

/** Accounts listed at most; a big tag rename or delete can touch thousands. */
const MAX_ACCOUNTS = 200;
/** Names a tag row shows when opened, before "Show all". */
const FIRST_NAMES = 10;

type OpenAccount = (username: string) => void;

/** A username that opens the account's popup. */
function NameLink({ username, onOpen }: { username: string; onOpen: OpenAccount }) {
  return (
    <Button
      variant="plain"
      h="auto"
      p="0"
      minW="0"
      textDecoration="underline"
      textUnderlineOffset="3px"
      wordBreak="break-all"
      whiteSpace="normal"
      textAlign="start"
      _hover={{ color: 'accent' }}
      onClick={() => {
        onOpen(username);
      }}
    >
      @{username}
    </Button>
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
        <HStack px="3" pb="3" gap="1.5 3" wrap="wrap">
          {row.usernames.slice(0, shown).map(username => (
            <NameLink key={username} username={username} onOpen={onOpen} />
          ))}
          {count > shown && shown < MAX_ACCOUNTS && (
            <Button
              variant="plain"
              h="auto"
              p="0"
              textDecoration="underline"
              textUnderlineOffset="3px"
              onClick={() => {
                setShown(MAX_ACCOUNTS);
              }}
            >
              Show all {count}
            </Button>
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
  const neverSaved = useAppSelector(s => s.master.savedAt === null);

  const subtitle = changedCount
    ? `${plural(changedCount, 'changed account')} since ${neverSaved ? 'the import' : 'your last save'}`
    : dirty
      ? 'New import, no account changes'
      : 'No edits since your last save.';

  return (
    <>
      <Drawer.Header display="block">
        <Drawer.Title textStyle="sheetTitle">Unsaved changes</Drawer.Title>
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
            <Text color="fg.muted">
              Save downloads an updated master file with these changes. Keep it for your next import.
            </Text>
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
export function UnsavedSheet({
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
          <Drawer.Content maxW="xl" mx="auto" maxH="90dvh" borderTopWidth="1px">
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
