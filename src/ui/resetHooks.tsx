import { Stack, Text } from '@chakra-ui/react';

import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { resetChanges } from '../store/masterSlice.ts';
import { selectUnsavedAccountCount } from '../store/selectors.ts';
import { SAVE_STATUSES } from '../store/statuses.ts';

import { useConfirm } from './dialogHooks.ts';
import { plural } from './statusText.ts';

/** Reset changes, shared by the ⋯ menu and the Unsaved changes drawer: asks first, then goes back to the last save. */
export function useResetChanges(): { canReset: boolean; reset: () => Promise<void> } {
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
  }

  return { canReset: unsavedCount > 0 && !saving, reset };
}
