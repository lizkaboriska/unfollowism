import { Stack, Text } from '@chakra-ui/react';

import { resetChanges } from '@/entities/master/model/masterSlice.ts';
import { selectUnsavedAccountCount } from '@/entities/master/model/selectors.ts';
import { SAVE_STATUSES } from '@/entities/master/model/statuses.ts';
import { plural } from '@/entities/master/ui/statusText.ts';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';
import { useConfirm } from '@/shared/ui/dialogHooks.ts';

/**
 * Reset changes, shared by the ⋯ menu and the Unsaved changes popup: asks first, then goes back to the last save.
 * `reset` resolves true when the changes were reset.
 */
export function useResetChanges(): { canReset: boolean; reset: () => Promise<boolean> } {
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  const unsavedCount = useAppSelector(selectUnsavedAccountCount);
  const saving = useAppSelector(s => s.master.saveStatus === SAVE_STATUSES.SAVING);
  const neverSaved = useAppSelector(s => s.master.savedAt === null);

  async function reset() {
    // Never saved (started from an Instagram export only): Reset goes back to the import, and there's no master file.
    const since = neverSaved ? 'since the import' : 'since your last save';
    const confirmed = await confirm({
      title: 'Reset unsaved changes?',
      body: (
        <Stack gap="3">
          <Text>
            Your changes to {plural(unsavedCount, 'account')} {since} will be undone.
          </Text>
          <Text>
            {neverSaved ? 'Instagram stays as it is.' : 'Your saved master file and Instagram stay as they are.'}
          </Text>
        </Stack>
      ),
      confirmLabel: 'Reset changes',
      destructive: true,
    });
    if (confirmed) {
      dispatch(resetChanges());
    }
    return confirmed;
  }

  return { canReset: unsavedCount > 0 && !saving, reset };
}
