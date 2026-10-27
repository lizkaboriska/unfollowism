import { memo } from "react";
import { Badge, Box, Button, Checkbox, HStack, Input, Link, Stack, Text } from "@chakra-ui/react";
import {
  ACTION_TYPES,
  FOLLOW_CHANGES,
  PLAN_STATES,
  followChangeMatches,
  planOf,
  profileUrl,
  relationshipOf,
  type ActionType,
  type Follow,
  type PlanState,
  type ReadonlyAccount,
} from "../core/index.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { setNote, setPlan, setReviewed, setUnavailable, toggleTag } from "../store/masterSlice.ts";
import { selectAccount, selectChangesSince, selectTagOptions } from "../store/selectors.ts";
import { formatSince } from "./dates.ts";
import { openProfilePopup } from "./instagramLink.ts";
import { CHANGE_BADGE_LABELS, PLAN_LABELS, RELATIONSHIP_LABELS } from "./labels.ts";

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <Checkbox.Root size="sm" checked={checked} onCheckedChange={e => { onChange(e.checked === true); }}>
      <Checkbox.HiddenInput />
      <Checkbox.Control />
      <Checkbox.Label>{label}</Checkbox.Label>
    </Checkbox.Root>
  );
}

function sinceText(prefix: string, follow: Follow | null): string | null {
  if (!follow) return null;
  return `${prefix} ${follow.since === null ? "(date unknown)" : formatSince(follow.since)}`;
}

/** "To unfollow" (+ "Done" once marked). Offered only while the follow exists, or when already marked. */
function PlanControls({ account, type }: { account: ReadonlyAccount; type: ActionType }) {
  const dispatch = useAppDispatch();
  const plan = planOf(account, type);
  const followExists = type === ACTION_TYPES.UNFOLLOW ? account.following !== null : account.followedBy !== null;
  if (plan === undefined && !followExists) return null;
  const set = (state: PlanState | null) => dispatch(setPlan({ username: account.username, type, state }));
  return (
    <HStack gap="3">
      <CheckboxField label={PLAN_LABELS[type].checkbox} checked={plan !== undefined} onChange={checked => set(checked ? PLAN_STATES.PLANNED : null)} />
      {plan !== undefined && (
        <CheckboxField label="Done" checked={plan === PLAN_STATES.DONE} onChange={checked => set(checked ? PLAN_STATES.DONE : PLAN_STATES.PLANNED)} />
      )}
    </HStack>
  );
}

export const AccountCard = memo(function AccountCard({ accountKey }: { accountKey: string }) {
  const dispatch = useAppDispatch();
  const account = useAppSelector(s => selectAccount(s, accountKey));
  const since = useAppSelector(selectChangesSince);
  const tagOptions = useAppSelector(selectTagOptions);
  if (!account) return null;

  const { username, review } = account;
  const changes = Object.values(FOLLOW_CHANGES).filter(change => followChangeMatches(account, change, since));
  const dates = [sinceText("You followed", account.following), sinceText("Followed you", account.followedBy)].filter(Boolean);

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
      <Stack direction={{ base: "column", md: "row" }} gap="4">
        <Stack gap="1" flex="1" minW="0">
          <Link href={profileUrl(username)} target="_blank" rel="noopener noreferrer" fontWeight="semibold" onClick={openProfilePopup} wordBreak="break-all">
            @{username} ↗
          </Link>
          <HStack gap="1" wrap="wrap">
            <Badge>{RELATIONSHIP_LABELS[relationshipOf(account)]}</Badge>
            {review.unavailable && <Badge colorPalette="gray">Unavailable</Badge>}
            {changes.map(change => <Badge key={change} colorPalette="pink">{CHANGE_BADGE_LABELS[change]}</Badge>)}
          </HStack>
          <Text fontSize="sm" color="fg.muted">
            {dates.length ? dates.join(" · ") : "No relationship date in export"}
          </Text>
        </Stack>

        <Stack gap="3" flex="2" minW="0">
          <HStack gap="4" wrap="wrap">
            <CheckboxField label="Reviewed" checked={review.reviewed} onChange={reviewed => dispatch(setReviewed({ username, reviewed }))} />
            <CheckboxField label="Unavailable" checked={review.unavailable} onChange={unavailable => dispatch(setUnavailable({ username, unavailable }))} />
            {Object.values(ACTION_TYPES).map(type => <PlanControls key={type} account={account} type={type} />)}
          </HStack>
          <HStack gap="1" wrap="wrap" aria-label={`Tags for @${username}`}>
            {tagOptions.map(tag => {
              const on = review.tags.includes(tag);
              return (
                <Button
                  key={tag}
                  size="xs"
                  variant={on ? "solid" : "outline"}
                  colorPalette={on ? "pink" : "gray"}
                  aria-pressed={on}
                  onClick={() => dispatch(toggleTag({ username, tag }))}
                >
                  {tag}
                </Button>
              );
            })}
          </HStack>
          <Input
            size="sm"
            placeholder="Add note…"
            aria-label={`Note for @${username}`}
            value={review.notes}
            onChange={e => dispatch(setNote({ username, note: e.currentTarget.value }))}
          />
        </Stack>
      </Stack>
    </Box>
  );
});
