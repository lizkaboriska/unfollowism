import { Badge, HStack } from '@chakra-ui/react';

import { RELATIONSHIPS } from '../core/index.ts';
import { useAppSelector } from '../store/hooks.ts';
import { selectRelationshipStats } from '../store/selectors.ts';

import { RELATIONSHIP_LABELS } from './labels.ts';

/** The relationship badges use the same names as the cards and the Scope filter. */
export function RelationshipCounts() {
  const stats = useAppSelector(selectRelationshipStats);
  return (
    <HStack gap="2" wrap="wrap">
      <Badge>Following {stats.following}</Badge>
      <Badge>Followers {stats.followers}</Badge>
      <Badge>
        {RELATIONSHIP_LABELS[RELATIONSHIPS.MUTUAL]} {stats.mutual}
      </Badge>
      <Badge>
        {RELATIONSHIP_LABELS[RELATIONSHIPS.NOT_FOLLOWING_BACK]} {stats.notFollowingBack}
      </Badge>
      <Badge>
        {RELATIONSHIP_LABELS[RELATIONSHIPS.FOLLOWS_YOU_ONLY]} {stats.followsYouOnly}
      </Badge>
    </HStack>
  );
}
