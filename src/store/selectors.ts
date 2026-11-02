import { createSelector } from '@reduxjs/toolkit';

import { groupSessionChanges } from '@/entities/master/lib/index.ts';
import { selectUnsavedDiff } from '@/entities/master/model/selectors.ts';

/** The unsaved changes as the popup shows them: tag rows, then the other changes per account. */
export const selectUnsavedGroups = createSelector([selectUnsavedDiff], groupSessionChanges);
