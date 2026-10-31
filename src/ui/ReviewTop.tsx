import { useState } from 'react';

import { FilterSheet } from './FilterSheet.tsx';
import { ListControls } from './ListControls.tsx';
import { ReviewHeading } from './ReviewHeading.tsx';
import { StatsBox } from './StatsBox.tsx';

/** The top of the Review tab: heading, your numbers, and the controls for what the list shows. */
export function ReviewTop() {
  const [filterOpen, setFilterOpen] = useState(false);
  return (
    <>
      <ReviewHeading />
      <StatsBox />
      <ListControls
        onOpenFilter={() => {
          setFilterOpen(true);
        }}
      />
      <FilterSheet
        open={filterOpen}
        onClose={() => {
          setFilterOpen(false);
        }}
      />
    </>
  );
}
