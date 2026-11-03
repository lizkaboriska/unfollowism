import { createSelector } from '@reduxjs/toolkit';

import { groupSessionChanges, selectUnsavedDiff } from '@/entities/master';

/** The unsaved changes as the popup shows them: tag rows, then the other changes per account. */
export const selectUnsavedGroups = createSelector([selectUnsavedDiff], groupSessionChanges);
