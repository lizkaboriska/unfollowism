import {
  Box,
  Button,
  CloseButton,
  Drawer,
  Link,
  Portal,
  SimpleGrid,
  Stack,
  Switch,
  Text,
  Wrap,
} from '@chakra-ui/react';
import type { ReactNode } from 'react';

import {
  ACTION_TYPES,
  PLAN_STATES,
  followExists,
  isPastAccount,
  planOf,
  profileUrl,
  relationshipOf,
  type ActionType,
  type Follow,
  type ReadonlyAccount,
} from '@/entities/master/lib/index.ts';
import { setPlan, setUnavailable, toggleTag } from '@/entities/master/model/masterSlice.ts';
import { selectAccount, selectTags } from '@/entities/master/model/selectors.ts';
import { openProfilePopup } from '@/entities/master/ui/instagramLink.ts';
import { RELATIONSHIP_NOTES, planText, queueText } from '@/entities/master/ui/labels.ts';
import { KeepButton } from '@/entities/master/ui/ReviewCard.tsx';
import { formatSince } from '@/shared/lib/dates.ts';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';

import { NewTag } from './NewTag.tsx';
import { NoteField } from './NoteField.tsx';
import { keepOpenOnOwnEscape } from './ownEscape.ts';

function Section({ legend, children }: { legend: ReactNode; children: ReactNode }) {
  return (
    <Box as="fieldset">
      <Text as="legend" textStyle="control" mb="2">
        {legend}
      </Text>
      {children}
    </Box>
  );
}

/** Queue unfollow / ✓ Unfollow queued: offered while the follow exists, or when already queued. */
function QueueToggle({ account, type }: { account: ReadonlyAccount; type: ActionType }) {
  const dispatch = useAppDispatch();
  const plan = planOf(account, type);
  if (plan === undefined && !followExists(account, type)) {
    return null;
  }
  const { username } = account;
  return plan === undefined ? (
    <Button
      variant="outline"
      aria-pressed={false}
      onClick={() => dispatch(setPlan({ username, type, state: PLAN_STATES.PLANNED }))}
    >
      {queueText(type)}
    </Button>
  ) : (
    <Button colorPalette="accent" aria-pressed onClick={() => dispatch(setPlan({ username, type, state: null }))}>
      ✓ {planText(type, plan)}
    </Button>
  );
}

function sinceText(follow: Follow | null): string {
  if (!follow) {
    return 'Not in export';
  }
  return follow.since === null ? 'Date unknown' : formatSince(follow.since);
}

function AccountDetails({ account }: { account: ReadonlyAccount }) {
  const dispatch = useAppDispatch();
  const tags = useAppSelector(selectTags);
  const { username, review } = account;
  return (
    <Stack gap="5">
      {/* A past account has nothing left to decide. */}
      {!isPastAccount(account) && (
        <Section legend="Your decision">
          <Stack gap="2">
            <KeepButton account={account} />
            <SimpleGrid columns={2} gap="2">
              {Object.values(ACTION_TYPES).map(type => (
                <QueueToggle key={type} account={account} type={type} />
              ))}
            </SimpleGrid>
            <Text textStyle="small" color="fg.muted">
              Queue one or both. Keep clears them.
            </Text>
          </Stack>
        </Section>
      )}
      <Section legend="Tags">
        <Wrap gap="2" role="group" aria-label={`Tags for @${username}`}>
          {tags.map(tag => {
            const on = review.tags.includes(tag);
            return (
              <Button
                key={tag}
                size="sm"
                h="8"
                variant={on ? 'solid' : 'outline'}
                aria-pressed={on}
                aria-label={tag}
                onClick={() => dispatch(toggleTag({ username, tag }))}
              >
                {on ? `✓ ${tag}` : tag}
              </Button>
            );
          })}
          <NewTag username={username} tags={tags} has={review.tags} label="+ New tag" />
        </Wrap>
      </Section>
      <Switch.Root
        name={`unavailable-${username}`}
        checked={review.unavailable}
        onCheckedChange={e => dispatch(setUnavailable({ username, unavailable: e.checked }))}
        display="flex"
        justifyContent="space-between"
        gap="4"
      >
        <Switch.HiddenInput />
        <Switch.Label>
          <Text textStyle="control">Unavailable</Text>
          <Text textStyle="small" color="fg.muted" fontWeight="normal">
            Mark if the profile can&apos;t be opened.
          </Text>
        </Switch.Label>
        <Switch.Control />
      </Switch.Root>
      <Box>
        <Text textStyle="control" mb="2">
          Note{' '}
          <Text as="span" textStyle="small" color="fg.muted">
            · just for you
          </Text>
        </Text>
        <NoteField username={username} note={review.notes} multiline />
      </Box>
      <Box as="dl" display="grid" gridTemplateColumns="auto 1fr" columnGap="4" rowGap="1">
        <Text as="dt" color="fg.muted">
          Following since
        </Text>
        <Text as="dd">{sinceText(account.following)}</Text>
        <Text as="dt" color="fg.muted">
          Follows you since
        </Text>
        <Text as="dd">{sinceText(account.followedBy)}</Text>
      </Box>
      <Link
        href={profileUrl(username)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={openProfilePopup}
        textDecoration="underline"
        textUnderlineOffset="3px"
        _hover={{ color: 'accent' }}
      >
        Open in Instagram ↗
      </Link>
    </Stack>
  );
}

/** Everything about one account: decision, tags, unavailable, note, dates and its Instagram profile. */
export function AccountPopup({ accountKey, onClose }: { accountKey: string | null; onClose: () => void }) {
  const account = useAppSelector(s => (accountKey === null ? undefined : selectAccount(s, accountKey)));
  return (
    <Drawer.Root
      open={account !== undefined}
      onOpenChange={e => {
        if (!e.open) {
          onClose();
        }
      }}
      onEscapeKeyDown={keepOpenOnOwnEscape}
      placement="bottom"
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content maxW="xl" mx="auto" maxH="90dvh" borderTopWidth="1px">
            {account && (
              <>
                <Drawer.Header display="block">
                  <Drawer.Title textStyle="sheetTitle" wordBreak="break-all">
                    @{account.username}
                  </Drawer.Title>
                  <Text textStyle="note" color="fg.muted">
                    {RELATIONSHIP_NOTES[relationshipOf(account)]}
                  </Text>
                </Drawer.Header>
                <Drawer.Body pb="6">
                  <AccountDetails account={account} />
                </Drawer.Body>
              </>
            )}
            <Drawer.CloseTrigger asChild>
              <CloseButton variant="outline" aria-label="Close" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
