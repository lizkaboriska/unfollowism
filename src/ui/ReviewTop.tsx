import { Text } from '@chakra-ui/react';
import { useState } from 'react';

import { REVIEW_SCOPES } from '../core/index.ts';
import { useAppSelector } from '../store/hooks.ts';

import { FilterSheet } from './FilterSheet.tsx';
import { ListControls } from './ListControls.tsx';
import { ReviewHeading } from './ReviewHeading.tsx';
import { StatsBox } from './StatsBox.tsx';

/** The top of the Review tab: heading, your numbers, and the controls for what the list shows. */
export function ReviewTop() {
  const [filterOpen, setFilterOpen] = useState(false);
  const followersOnly = useAppSelector(s => s.filters.scope === REVIEW_SCOPES.FOLLOWS_YOU_ONLY);
  return (
    <>
      <ReviewHeading />
      <StatsBox />
      <ListControls
        onOpenFilter={() => {
          setFilterOpen(true);
        }}
      />
      {followersOnly && (
        <Text color="fg.muted">Queue a follower removal here. You&apos;ll make the change yourself in Instagram.</Text>
      )}
      <FilterSheet
        open={filterOpen}
        onClose={() => {
          setFilterOpen(false);
        }}
      />
    </>
  );
}
