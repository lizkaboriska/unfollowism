import { memo, useState, type KeyboardEvent } from 'react';
import { useDebouncedCallback } from 'use-debounce';
import { Badge, Box, Button, Checkbox, HStack, Input, Stack, Text } from '@chakra-ui/react';
import {
  ACTION_TYPES,
  FOLLOW_CHANGES,
  PLAN_FIELDS,
  PLAN_STATES,
  findTag,
  followChangeMatches,
  followExists,
  planOf,
  relationshipOf,
  type ActionType,
  type Follow,
  type ReadonlyAccount,
} from '../core/index.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { setNote, setPlan, setReviewed, setUnavailable, toggleTag } from '../store/masterSlice.ts';
import { selectAccount, selectChangesSince, selectTags } from '../store/selectors.ts';
import { formatSince } from './dates.ts';
import { CHANGE_BADGE_LABELS, PLAN_LABELS, RELATIONSHIP_LABELS } from './labels.ts';
import { ProfileLink } from './ProfileLink.tsx';
import { RenameSuggestion } from './RenameSuggestion.tsx';

/** `name` identifies the field to the browser (e.g. "reviewed-bob"); the app itself doesn't read it. */
function CheckboxField({
  name,
  label,
  checked,
  onChange,
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Checkbox.Root
      size="sm"
      name={name}
      checked={checked}
      onCheckedChange={e => {
        onChange(e.checked === true);
      }}
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control />
      <Checkbox.Label>{label}</Checkbox.Label>
    </Checkbox.Root>
  );
}

function sinceText(prefix: string, follow: Follow | null): string | null {
  if (!follow) return null;
  return `${prefix} ${follow.since === null ? '(date unknown)' : formatSince(follow.since)}`;
}

/**
 * "+ tag": a new tag is created by adding it to an account (a tag nobody has doesn't exist).
 * A name matching an existing tag in any letter case reuses that tag.
 */
function NewTag({ username, tags, has }: { username: string; tags: readonly string[]; has: readonly string[] }) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<string | null>(null); // null = closed
  if (draft === null) {
    return (
      <Button
        size="xs"
        variant="ghost"
        onClick={() => {
          setDraft('');
        }}
      >
        + tag
      </Button>
    );
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Escape') setDraft(null);
    if (event.key !== 'Enter' || draft === null) return;
    const name = draft.trim();
    const tag = findTag(tags, name) ?? name;
    if (tag && !has.includes(tag)) dispatch(toggleTag({ username, tag }));
    setDraft(null);
  }
  return (
    <Input
      size="xs"
      width="32"
      autoFocus
      name={`newTag-${username}`}
      autoComplete="off"
      placeholder="new tag…"
      aria-label={`New tag for @${username}`}
      value={draft}
      onChange={e => {
        setDraft(e.currentTarget.value);
      }}
      onKeyDown={onKeyDown}
      onBlur={() => {
        setDraft(null);
      }}
    />
  );
}

/**
 * "To unfollow" / "To remove" as a plain tick; unticking cancels the plan. Offered only while
 * the follow exists, or when already marked. Marking it done happens in the To do list.
 */
function PlanControl({ account, type }: { account: ReadonlyAccount; type: ActionType }) {
  const dispatch = useAppDispatch();
  const plan = planOf(account, type);
  if (plan === undefined && !followExists(account, type)) return null;
  return (
    <CheckboxField
      name={`${PLAN_FIELDS[type]}-${account.username}`}
      label={PLAN_LABELS[type].checkbox}
      checked={plan !== undefined}
      onChange={checked =>
        dispatch(setPlan({ username: account.username, type, state: checked ? PLAN_STATES.PLANNED : null }))
      }
    />
  );
}

/** How long typing must pause before the note is stored. */
const NOTE_DEBOUNCE_MS = 300;

/**
 * The note, stored after a pause in typing (or on leaving the field) rather than on every letter.
 * Shows what you type at once; a change from elsewhere (Reset changes, a confirmed rename) shows when you're not
 * typing.
 */
function NoteField({ username, note }: { username: string; note: string }) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState(note);
  // flushOnExit: a card scrolled away (or a page closed) mid-typing still stores the note.
  const storeNote = useDebouncedCallback(
    (value: string) => dispatch(setNote({ username, note: value })),
    NOTE_DEBOUNCE_MS,
    { flushOnExit: true },
  );

  // The stored note changed (from typing here, or from elsewhere): show it unless more typing is on its way.
  const [shownNote, setShownNote] = useState(note);
  if (note !== shownNote) {
    setShownNote(note);
    if (!storeNote.isPending()) setDraft(note);
  }

  return (
    <Input
      size="sm"
      name={`note-${username}`}
      autoComplete="off"
      placeholder="Add note…"
      aria-label={`Note for @${username}`}
      value={draft}
      onChange={e => {
        setDraft(e.currentTarget.value);
        storeNote(e.currentTarget.value);
      }}
      onBlur={() => storeNote.flush()}
    />
  );
}

export const AccountCard = memo(function AccountCard({ accountKey }: { accountKey: string }) {
  const dispatch = useAppDispatch();
  const account = useAppSelector(s => selectAccount(s, accountKey));
  const since = useAppSelector(selectChangesSince);
  const tags = useAppSelector(selectTags);
  if (!account) return null;

  const { username, review } = account;
  const changes = Object.values(FOLLOW_CHANGES).filter(change => followChangeMatches(account, change, since));
  const dates = [sinceText('You followed', account.following), sinceText('Followed you', account.followedBy)].filter(
    Boolean,
  );

  return (
    <Box
      as="article"
      aria-label={`@${username}`}
      borderWidth="1px"
      borderRadius="lg"
      bg="white"
      p="4"
      opacity={review.unavailable ? 0.6 : 1}
    >
      <Stack direction={{ base: 'column', md: 'row' }} gap="4">
        <Stack gap="1" flex="1" minW="0">
          <ProfileLink username={username} />
          <HStack gap="1" wrap="wrap">
            <Badge>{RELATIONSHIP_LABELS[relationshipOf(account)]}</Badge>
            {review.unavailable && <Badge colorPalette="gray">Unavailable</Badge>}
            {changes.map(change => (
              <Badge key={change} colorPalette="pink">
                {CHANGE_BADGE_LABELS[change]}
              </Badge>
            ))}
          </HStack>
          <Text fontSize="sm" color="fg.muted">
            {dates.length ? dates.join(' · ') : 'No relationship date in export'}
          </Text>
          <RenameSuggestion accountKey={accountKey} />
        </Stack>

        <Stack gap="3" flex="2" minW="0">
          <HStack gap="4" wrap="wrap">
            <CheckboxField
              name={`reviewed-${username}`}
              label="Reviewed"
              checked={review.reviewed}
              onChange={reviewed => dispatch(setReviewed({ username, reviewed }))}
            />
            <CheckboxField
              name={`unavailable-${username}`}
              label="Unavailable"
              checked={review.unavailable}
              onChange={unavailable => dispatch(setUnavailable({ username, unavailable }))}
            />
            {Object.values(ACTION_TYPES).map(type => (
              <PlanControl key={type} account={account} type={type} />
            ))}
          </HStack>
          <HStack gap="1" wrap="wrap" aria-label={`Tags for @${username}`}>
            {tags.map(tag => {
              const on = review.tags.includes(tag);
              return (
                <Button
                  key={tag}
                  size="xs"
                  variant={on ? 'solid' : 'outline'}
                  colorPalette={on ? 'pink' : 'gray'}
                  aria-pressed={on}
                  onClick={() => dispatch(toggleTag({ username, tag }))}
                >
                  {tag}
                </Button>
              );
            })}
            <NewTag username={username} tags={tags} has={review.tags} />
          </HStack>
          <NoteField username={username} note={review.notes} />
        </Stack>
      </Stack>
    </Box>
  );
});
