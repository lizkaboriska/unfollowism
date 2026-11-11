import { Box, HStack, SimpleGrid, Text } from '@chakra-ui/react';

import { REVIEW_SCOPES, type ReviewScope, selectRelationshipStats } from '@/entities/master';
import { setScope } from '@/features/filters';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';
import { TextButton } from '@/shared/ui/TextButton.tsx';

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
  // 6 px wider each side (not 8): the links are 6 px from the dot, so the two tap areas don't touch.
  const link = (scope: ReviewScope, text: string) => (
    <TextButton px="1.5" mx="-1.5" onClick={() => dispatch(setScope(scope))}>
      {text}
    </TextButton>
  );
  return (
    <Box as="section" aria-label="Your numbers" borderWidth="1px">
      <SimpleGrid columns={3}>
        <Stat value={stats.following} label="Following" />
        <Stat value={stats.followers} label="Followers" />
        <Stat value={stats.mutual} label="Mutual" />
      </SimpleGrid>
      {/* When the line wraps (narrow phone, big numbers), 24 px between lines keeps the tap areas apart. */}
      <HStack columnGap="1.5" rowGap="6" p="3" borderTopWidth="1px" wrap="wrap" justify="center">
        {link(REVIEW_SCOPES.NOT_FOLLOWING_BACK, `${stats.notFollowingBack} not following back`)}
        <Text aria-hidden>·</Text>
        {link(REVIEW_SCOPES.FOLLOWS_YOU_ONLY, `${stats.followsYouOnly} follow you only`)}
      </HStack>
    </Box>
  );
}
