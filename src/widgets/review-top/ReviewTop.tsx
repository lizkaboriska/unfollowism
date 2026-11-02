import { Text } from '@chakra-ui/react';
import { useState } from 'react';

import { REVIEW_SCOPES } from '@/entities/master/lib/index.ts';
import { FilterPopup } from '@/features/filters/ui/FilterPopup.tsx';
import { ListControls } from '@/features/filters/ui/ListControls.tsx';
import { ManageTagsPopup } from '@/features/manage-tags/ManageTagsPopup.tsx';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

import { ReviewHeading } from './ReviewHeading.tsx';
import { StatsBox } from './StatsBox.tsx';

/** The top of the Review tab: heading, your numbers, and the controls for what the list shows. */
export function ReviewTop() {
  const [filterOpen, setFilterOpen] = useState(false);
  const [tagsOpen, setTagsOpen] = useState(false);
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
      <FilterPopup
        open={filterOpen}
        onClose={() => {
          setFilterOpen(false);
        }}
        onManageTags={() => {
          setFilterOpen(false);
          setTagsOpen(true);
        }}
      />
      <ManageTagsPopup
        open={tagsOpen}
        onClose={() => {
          setTagsOpen(false);
        }}
      />
    </>
  );
}
