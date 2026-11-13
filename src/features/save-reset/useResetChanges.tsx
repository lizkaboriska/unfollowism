import { Stack, Text } from '@chakra-ui/react';

import {
  resetChanges,
  selectHasBeenSaved,
  selectIsImportUnsaved,
  selectIsSaving,
  selectUnsavedAccountCount,
} from '@/entities/master';
import { plural } from '@/shared/lib/plural.ts';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';
import { useConfirm } from '@/shared/ui/useConfirm.ts';

/**
 * Reset changes, shared by the ⋯ menu and the Unsaved changes popup: asks first, then goes back to the last save.
 * `reset` resolves true when the changes were reset.
 */
export function useResetChanges(): { canReset: boolean; reset: () => Promise<boolean> } {
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  const unsavedCount = useAppSelector(selectUnsavedAccountCount);
  const isSaving = useAppSelector(selectIsSaving);
  const hasBeenSaved = useAppSelector(selectHasBeenSaved);
  const isImportUnsaved = useAppSelector(selectIsImportUnsaved);

  async function reset() {
    // Never saved (started from an Instagram export only): Reset goes back to the import, and there's no master file.
    const since = hasBeenSaved ? 'since your last backup' : 'since adding the data';
    const isConfirmed = await confirm({
      title: 'Reset changes?',
      body: (
        <Stack gap="3">
          <Text>
            Your changes to {plural(unsavedCount, 'account')} {since} will be undone.
          </Text>
          <Text>
            {!hasBeenSaved
              ? 'Instagram stays as it is.'
              : isImportUnsaved
                ? 'Your progress file and the new Instagram data stay as they are.'
                : 'Your progress file and Instagram stay as they are.'}
          </Text>
        </Stack>
      ),
      confirmLabel: 'Reset changes',
      isDestructive: true,
    });
    if (isConfirmed) {
      dispatch(resetChanges());
    }
    return isConfirmed;
  }

  return { canReset: unsavedCount > 0 && !isSaving, reset };
}
