import { Text } from '@chakra-ui/react';
import { useState } from 'react';

import { REVIEW_SCOPES } from '@/entities/master';
import { FilterPopup, ListControls } from '@/features/filters';
import { ManageTagsPopup } from '@/features/manage-tags';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

import { ReviewHeading } from './ReviewHeading.tsx';
import { StatsBox } from './StatsBox.tsx';

/** The top of the Review tab: heading, your numbers, and the controls for what the list shows. */
export function ReviewTop() {
  const [isFilterOpen, setFilterOpen] = useState(false);
  const [isTagsOpen, setTagsOpen] = useState(false);
  const isFollowersOnly = useAppSelector(state => state.filters.scope === REVIEW_SCOPES.FOLLOWS_YOU_ONLY);
  return (
    <>
      <ReviewHeading />
      <StatsBox />
      <ListControls
        onOpenFilter={() => {
          setFilterOpen(true);
        }}
      />
      {isFollowersOnly && (
        <Text color="fg.muted">Queue a follower removal here. You&apos;ll make the change yourself in Instagram.</Text>
      )}
      <FilterPopup
        open={isFilterOpen}
        onClose={() => {
          setFilterOpen(false);
        }}
        onManageTags={() => {
          setFilterOpen(false);
          setTagsOpen(true);
        }}
      />
      <ManageTagsPopup
        open={isTagsOpen}
        onClose={() => {
          setTagsOpen(false);
        }}
      />
    </>
  );
}
