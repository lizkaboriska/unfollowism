import { Stack, Text } from '@chakra-ui/react';

import { resetChanges, selectUnsavedAccountCount, SAVE_STATUSES, plural } from '@/entities/master';
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
  const saving = useAppSelector(s => s.master.saveStatus === SAVE_STATUSES.SAVING);
  const neverSaved = useAppSelector(s => s.master.savedAt === null);

  async function reset() {
    // Never saved (started from an Instagram export only): Reset goes back to the import, and there's no master file.
    const since = neverSaved ? 'since adding the data' : 'since your last save';
    const confirmed = await confirm({
      title: 'Reset unsaved changes?',
      body: (
        <Stack gap="3">
          <Text>
            Your changes to {plural(unsavedCount, 'account')} {since} will be undone.
          </Text>
          <Text>
            {neverSaved ? 'Instagram stays as it is.' : 'Your saved progress file and Instagram stay as they are.'}
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
