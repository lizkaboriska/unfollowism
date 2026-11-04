import { Box, Button, HStack, SimpleGrid, Text } from '@chakra-ui/react';

import { REVIEW_SCOPES, type ReviewScope } from '@/entities/master';
import { selectRelationshipStats } from '@/entities/master';
import { setScope } from '@/features/filters';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Box p="3" textAlign="center">
      <Text textStyle="number">{value}</Text>
      <Text color="fg.muted">{label}</Text>
    </Box>
  );
}

/** Your numbers; the line under them switches the list to those accounts. */
export function StatsBox() {
  const dispatch = useAppDispatch();
  const stats = useAppSelector(selectRelationshipStats);
  const link = (scope: ReviewScope, text: string) => (
    <Button
      variant="plain"
      h="auto"
      minW="0"
      p="0"
      textStyle="body"
      textDecoration="underline"
      textUnderlineOffset="3px"
      _hover={{ color: 'accent' }}
      onClick={() => dispatch(setScope(scope))}
    >
      {text}
    </Button>
  );
  return (
    <Box as="section" aria-label="Your numbers" borderWidth="1px">
      <SimpleGrid columns={3}>
        <Stat value={stats.following} label="Following" />
        <Stat value={stats.followers} label="Followers" />
        <Stat value={stats.mutual} label="Mutual" />
      </SimpleGrid>
      <HStack gap="1.5" p="3" borderTopWidth="1px" wrap="wrap" justify="center">
        {link(REVIEW_SCOPES.NOT_FOLLOWING_BACK, `${stats.notFollowingBack} not following back`)}
        <Text aria-hidden>·</Text>
        {link(REVIEW_SCOPES.FOLLOWS_YOU_ONLY, `${stats.followsYouOnly} follow you only`)}
      </HStack>
    </Box>
  );
}
