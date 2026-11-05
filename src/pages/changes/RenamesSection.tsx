import { Box, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { useId } from 'react';

import { RenameState, selectRenamePairs } from '@/entities/master';
import { RenamePairRow } from '@/features/rename-suggestion';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

/**
 * First on Changes: the renames the import suggested. "Possible renames" while any is waiting, "Renames" once all
 * are decided. Nothing when the import found none.
 */
export function RenamesSection() {
  const pairs = useAppSelector(selectRenamePairs);
  const headingId = useId();
  if (pairs.length === 0) {
    return null;
  }
  const waiting = pairs.some(pair => pair.state === RenameState.WAITING);
  return (
    <Stack as="section" aria-labelledby={headingId} gap="2">
      <Box>
        <HStack justify="space-between" align="baseline">
          <Heading as="h2" id={headingId} textStyle="heading">
            {waiting ? 'Possible renames' : 'Renames'}
          </Heading>
          <Text textStyle="small" color="fg.muted">
            {pairs.length}
          </Text>
        </HStack>
        <Text textStyle="note" color="fg.muted">
          These look like one account with a new name: same follow dates.
        </Text>
      </Box>
      <Box as="ul" m="0" p="0" borderWidth="1px">
        {pairs.map(pair => (
          <RenamePairRow key={pair.from} pair={pair} />
        ))}
      </Box>
    </Stack>
  );
}
