import { Box, Button, Grid, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { useCallback, useId, useState } from 'react';

import {
  FOLLOW_CHANGES,
  type FollowChange,
  selectChangeSections,
  selectChangesSince,
  selectChangesTotal,
  selectImportedAt,
  selectRelationshipStats,
  CHANGE_SECTION_TITLES,
} from '@/entities/master';
import { AccountPopup } from '@/features/account-popup';
import { formatDate } from '@/shared/lib/dates.ts';
import { plural } from '@/shared/lib/plural.ts';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

import { ChangeRow } from './ChangeRow.tsx';
import { RenamesSection } from './RenamesSection.tsx';

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

/**
 * The previous import against the new one, as a small table: the two dates head the columns, then Following and
 * Followers with each before number under the old date and each after number under the new one.
 */
function CompareBox({ since }: { since: string }) {
  const importedAt = useAppSelector(selectImportedAt);
  const facts = useAppSelector(state => state.master.importFacts);
  const stats = useAppSelector(selectRelationshipStats);
  const numbers = [
    { label: 'Following', before: facts?.followingBefore, after: stats.following },
    { label: 'Followers', before: facts?.followersBefore, after: stats.followers },
  ];
  return (
    <Grid
      as="section"
      aria-label="Compared files"
      borderWidth="1px"
      p="3"
      templateColumns="auto minmax(0, 1fr) auto minmax(0, 1fr)"
      columnGap="2"
      rowGap="1.5"
      alignItems="baseline"
      textAlign="center"
    >
      <Box />
      <Text textStyle="small" color="fg.muted">
        {formatDate(since)}
      </Text>
      <Text textStyle="small" color="fg.muted" aria-hidden>
        →
      </Text>
      <Text textStyle="small">{importedAt ? formatDate(importedAt) : 'New data'}</Text>
      {numbers.map(({ label, before, after }) => (
        <Grid key={label} role="group" aria-label={label} gridColumn="1 / -1" templateColumns="subgrid">
          <Text color="fg.muted" textAlign="start">
            {label}
          </Text>
          <Text textStyle="number" fontSize={{ base: '1.5rem', sm: '2rem' }}>
            {before}
          </Text>
          <Text textStyle="number" fontSize={{ base: '1.5rem', sm: '2rem' }} aria-hidden>
            {before === undefined ? '' : '→'}
          </Text>
          <Text textStyle="number" fontSize={{ base: '1.5rem', sm: '2rem' }}>
            {after}
          </Text>
        </Grid>
      ))}
    </Grid>
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
  const [isExpanded, setExpanded] = useState(false);
  const headingId = useId();
  const shown = isExpanded ? keys : keys.slice(0, FIRST_ROWS);
  const note = SECTION_NOTES[change];
  return (
    <Stack as="section" aria-labelledby={headingId} gap="2">
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
                setExpanded(!isExpanded);
              }}
            >
              {isExpanded ? 'Show fewer' : `Show all ${keys.length}`}
            </Button>
          </Box>
        )}
      </Box>
    </Stack>
  );
}

/**
 * What changed since the previous import: the suggested renames, then four sections of rows. Each row opens the
 * account popup. On a first import there is nothing to compare with yet.
 */
export function ChangesPage() {
  const since = useAppSelector(selectChangesSince);
  const sections = useAppSelector(selectChangeSections);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const open = useCallback((accountKey: string) => {
    setOpenKey(accountKey);
  }, []);

  const total = useAppSelector(selectChangesTotal);

  return (
    <Stack gap="3">
      <Stack gap="1">
        <Heading as="h1" textStyle="title">
          Changes
        </Heading>
        {since && (
          <Text textStyle="small" color="fg.muted">
            {plural(total, 'change')} since your previous import, {formatDate(since)}
          </Text>
        )}
        <Text textStyle="note" color="fg.muted" mt="1">
          A snapshot of your circle, not a score.
        </Text>
      </Stack>

      {since === null ? (
        <Text color="fg.muted">Nothing to compare yet. Next time you add Instagram data, this shows what changed.</Text>
      ) : (
        <>
          <CompareBox since={since} />
          {total === 0 && <Text color="fg.muted">Nothing changed since your previous import.</Text>}
          {/* 32 between sections (12 + mt), so each list reads as its own group. */}
          {total > 0 && (
            <Stack gap="8" mt="5">
              <RenamesSection />
              {SECTION_ORDER.filter(change => sections[change].length > 0).map(change => (
                <Section key={change} change={change} keys={sections[change]} onOpen={open} />
              ))}
            </Stack>
          )}
        </>
      )}

      <Text textStyle="small" color="fg.muted" lineHeight="1.5" mt={since !== null && total > 0 ? '5' : '0'}>
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
