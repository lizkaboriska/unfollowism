import { Box, Button, Grid, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { useCallback, useId, useState } from 'react';

import { FOLLOW_CHANGES, type FollowChange } from '@/entities/master';
import {
  selectChangeSections,
  selectChangesSince,
  selectRelationshipStats,
  CHANGE_SECTION_TITLES,
  plural,
} from '@/entities/master';
import { AccountPopup } from '@/features/account-popup';
import { formatDate } from '@/shared/lib/dates.ts';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

import { ChangeRow } from './ChangeRow.tsx';

/** Rows a section shows before "Show all". */
const FIRST_ROWS = 3;

const SECTION_ORDER: readonly FollowChange[] = [
  FOLLOW_CHANGES.NEW_FOLLOWERS,
  FOLLOW_CHANGES.LOST_FOLLOWERS,
  FOLLOW_CHANGES.NEW_FOLLOWS,
  FOLLOW_CHANGES.UNFOLLOWED,
];

/** Soft lines under a section heading, only where they answer a feeling. */
const SECTION_NOTES: Partial<Record<FollowChange, string>> = {
  [FOLLOW_CHANGES.LOST_FOLLOWERS]: 'People change their feeds. It’s okay.',
};

/** The saved master against the new import: the two dates, then Following and Followers before → after. */
function CompareBox({ since }: { since: string }) {
  const importedAt = useAppSelector(s => s.master.base?.lastImportAt ?? null);
  const facts = useAppSelector(s => s.master.importFacts);
  const stats = useAppSelector(selectRelationshipStats);
  const numbers = [
    { label: 'Following', before: facts?.followingBefore, after: stats.following },
    { label: 'Followers', before: facts?.followersBefore, after: stats.followers },
  ];
  return (
    <Box as="section" aria-label="Compared files" borderWidth="1px">
      <HStack justify="space-between" px="3" py="2.5" borderBottomWidth="1px" textStyle="small" color="fg.muted">
        <Text>{formatDate(since)} progress file</Text>
        <Text aria-hidden>→</Text>
        <Text color="fg">{importedAt ? `${formatDate(importedAt)} data` : 'New data'}</Text>
      </HStack>
      <Grid templateColumns="repeat(2, minmax(0, 1fr))">
        {numbers.map(({ label, before, after }) => (
          <Stack key={label} p="3" gap="1">
            <Text color="fg.muted">{label}</Text>
            <Text textStyle="number">{before === undefined ? after : `${before} → ${after}`}</Text>
          </Stack>
        ))}
      </Grid>
    </Box>
  );
}

/** One change list: heading and count, the first rows, and "Show all N" to expand it in place. */
function Section({
  change,
  keys,
  onOpen,
}: {
  change: FollowChange;
  keys: readonly string[];
  onOpen: (accountKey: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const shown = expanded ? keys : keys.slice(0, FIRST_ROWS);
  const note = SECTION_NOTES[change];
  return (
    <Stack as="section" aria-labelledby={headingId} gap="2.5">
      <Box>
        <HStack justify="space-between" align="baseline">
          <Heading as="h2" id={headingId} textStyle="heading">
            {CHANGE_SECTION_TITLES[change]}
          </Heading>
          <Text textStyle="small" color="fg.muted">
            {keys.length}
          </Text>
        </HStack>
        {note && (
          <Text textStyle="note" color="fg.muted">
            {note}
          </Text>
        )}
      </Box>
      <Box borderWidth="1px">
        <Box as="ul" m="0" p="0">
          {shown.map(key => (
            <ChangeRow key={key} accountKey={key} change={change} onOpen={onOpen} />
          ))}
        </Box>
        {/* The line is on the wrapper: the plain button style makes a button's own border transparent. */}
        {keys.length > FIRST_ROWS && (
          <Box borderTopWidth="1px">
            <Button
              variant="plain"
              w="full"
              h="11"
              textStyle="body"
              textDecoration="underline"
              textUnderlineOffset="3px"
              onClick={() => {
                setExpanded(!expanded);
              }}
            >
              {expanded ? 'Show fewer' : `Show all ${keys.length}`}
            </Button>
          </Box>
        )}
      </Box>
    </Stack>
  );
}

/**
 * What changed between the master you imported and the new export: four sections of rows. Each row opens the
 * account popup. Without a saved master there is nothing to compare with yet.
 */
export function ChangesPage() {
  const since = useAppSelector(selectChangesSince);
  const sections = useAppSelector(selectChangeSections);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = useCallback((accountKey: string) => {
    setOpenKey(accountKey);
  }, []);

  const total = SECTION_ORDER.reduce((sum, change) => sum + sections[change].length, 0);

  return (
    <Stack gap="6">
      <Stack gap="1">
        <Heading as="h1" textStyle="title">
          Changes
        </Heading>
        {since && (
          <Text textStyle="small" color="fg.muted">
            {plural(total, 'change')} since {formatDate(since)}
          </Text>
        )}
        <Text textStyle="note" color="fg.muted" mt="1">
          A snapshot of your circle, not a score.
        </Text>
      </Stack>

      {since === null ? (
        <Text color="fg.muted">Nothing to compare yet. Save once, and your next import shows what changed.</Text>
      ) : (
        <>
          <CompareBox since={since} />
          {total === 0 && <Text color="fg.muted">Nothing changed since {formatDate(since)}.</Text>}
          {SECTION_ORDER.filter(change => sections[change].length > 0).map(change => (
            <Section key={change} change={change} keys={sections[change]} onOpen={open} />
          ))}
        </>
      )}

      <Text textStyle="small" color="fg.muted" lineHeight="1.5">
        Compared on your device using your saved progress file. Nothing is checked live with Instagram.
      </Text>
      <AccountPopup
        accountKey={openKey}
        onClose={() => {
          setOpenKey(null);
        }}
      />
    </Stack>
  );
}
