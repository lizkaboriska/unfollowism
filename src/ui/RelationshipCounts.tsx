import { Badge, HStack } from "@chakra-ui/react";
import { useAppSelector } from "../store/hooks.ts";
import { selectRelationshipStats } from "../store/selectors.ts";

export function RelationshipCounts() {
  const stats = useAppSelector(selectRelationshipStats);
  return (
    <HStack gap="2" wrap="wrap">
      <Badge colorPalette="purple">Following {stats.following}</Badge>
      <Badge colorPalette="blue">Followers {stats.followers}</Badge>
      <Badge colorPalette="green">Mutual {stats.mutual}</Badge>
      <Badge colorPalette="red">Not back {stats.notFollowingBack}</Badge>
      <Badge colorPalette="blue">Followers only {stats.followsYouOnly}</Badge>
    </HStack>
  );
}
