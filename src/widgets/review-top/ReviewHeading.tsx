import { Box, Heading, Text } from '@chakra-ui/react';

import { selectImportedAt } from '@/entities/master';
import { formatDate } from '@/shared/lib/dates.ts';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

/** "Review" and when the shown export was imported. */
export function ReviewHeading() {
  const importedAt = useAppSelector(selectImportedAt);
  return (
    <Box>
      <Heading as="h1" textStyle="title">
        Review
      </Heading>
      {importedAt && (
        <Text textStyle="small" color="fg.muted" mt="1">
          Imported {formatDate(importedAt)}
        </Text>
      )}
    </Box>
  );
}
