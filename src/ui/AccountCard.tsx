import { Badge, Box, Button, Checkbox, HStack, Stack, Text } from '@chakra-ui/react';
import { memo } from 'react';

import {
  ACTION_TYPES,
  FOLLOW_CHANGES,
  PLAN_STATES,
  followChangeMatches,
  followExists,
  isKept,
  isPastAccount,
  planOf,
  relationshipOf,
  type ActionType,
  type Follow,
  type ReadonlyAccount,
} from '../core/index.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { setKept, setPlan, setUnavailable, toggleTag } from '../store/masterSlice.ts';
import { selectAccount, selectChangesSince, selectTags } from '../store/selectors.ts';

import { NewTag, NoteField } from './accountFields.tsx';
import { formatSince } from './dates.ts';
import { CHANGE_BADGE_LABELS, PLAN_LABELS, RELATIONSHIP_LABELS } from './labels.ts';
import { ProfileLink } from './ProfileLink.tsx';
import { RenameSuggestion } from './RenameSuggestion.tsx';

/** `name` identifies the field to the browser (e.g. "kept-bob"); the app itself doesn't read it. */
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
  if (!follow) {
    return null;
  }
  return `${prefix} ${follow.since === null ? '(date unknown)' : formatSince(follow.since)}`;
}

/**
 * "To unfollow" / "To remove" as a plain tick; unticking cancels the plan. Offered only while
 * the follow exists, or when already marked. Marking it done happens in the To do list.
 */
function PlanControl({ account, type }: { account: ReadonlyAccount; type: ActionType }) {
  const dispatch = useAppDispatch();
  const plan = planOf(account, type);
  if (plan === undefined && !followExists(account, type)) {
    return null;
  }
  return (
    <CheckboxField
      name={`${type}-${account.username}`}
      label={PLAN_LABELS[type].checkbox}
      checked={plan !== undefined}
      onChange={checked =>
        dispatch(setPlan({ username: account.username, type, state: checked ? PLAN_STATES.PLANNED : null }))
      }
    />
  );
}

export const AccountCard = memo(function AccountCard({ accountKey }: { accountKey: string }) {
  const dispatch = useAppDispatch();
  const account = useAppSelector(s => selectAccount(s, accountKey));
  const since = useAppSelector(selectChangesSince);
  const tags = useAppSelector(selectTags);
  if (!account) {
    return null;
  }

  const { username, review } = account;
  const changes = Object.values(FOLLOW_CHANGES).filter(change => followChangeMatches(account, change, since));
  const dates = [sinceText('You followed', account.following), sinceText('Followed you', account.followedBy)].filter(
    Boolean,
  );

  return (
    <Box as="article" aria-label={`@${username}`} borderWidth="1px" p="4" opacity={review.unavailable ? 0.6 : 1}>
      <Stack direction={{ base: 'column', md: 'row' }} gap="4">
        <Stack gap="1" flex="1" minW="0">
          <ProfileLink username={username} />
          <HStack gap="1" wrap="wrap">
            <Badge>{RELATIONSHIP_LABELS[relationshipOf(account)]}</Badge>
            {review.unavailable && <Badge>Unavailable</Badge>}
            {changes.map(change => (
              <Badge key={change}>{CHANGE_BADGE_LABELS[change]}</Badge>
            ))}
          </HStack>
          <Text fontSize="sm" color="fg.muted">
            {dates.length ? dates.join(' · ') : 'No relationship date in export'}
          </Text>
          <RenameSuggestion accountKey={accountKey} />
        </Stack>

        <Stack gap="3" flex="2" minW="0">
          <HStack gap="4" wrap="wrap">
            {!isPastAccount(account) && (
              <CheckboxField
                name={`kept-${username}`}
                label="Kept"
                checked={isKept(account)}
                onChange={kept => dispatch(setKept({ username, kept }))}
              />
            )}
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
