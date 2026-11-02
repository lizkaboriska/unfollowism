import { Box, Heading, Text } from '@chakra-ui/react';

import { selectChangesSince } from '@/entities/master/model/selectors.ts';
import { formatDate } from '@/shared/lib/dates.ts';

import { useAppSelector } from '../store/hooks.ts';

/** "Review" and when the shown export was imported, compared with which master. */
export function ReviewHeading() {
  const importedAt = useAppSelector(s => s.master.base?.lastImportAt ?? null);
  const since = useAppSelector(selectChangesSince);
  const compared = since ? `vs ${formatDate(since)} master` : 'no saved master yet';
  return (
    <Box>
      <Heading as="h1" textStyle="title">
        Review
      </Heading>
      {importedAt && (
        <Text textStyle="small" color="fg.muted" mt="1">
          Imported {formatDate(importedAt)} · {compared}
        </Text>
      )}
    </Box>
  );
}
