import { Button, type ButtonProps } from '@chakra-ui/react';

import { selectHasProject, selectIsDirty, SAVE_STATUSES, saveMaster } from '@/entities/master';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';
import { toaster } from '@/shared/ui/toasts.ts';

export const SAVED_TOAST = '✓ Progress file downloaded. Keep it for your next import.';

/**
 * Black while there is something to save, outlined once saved. `onSaved` runs after a save that worked.
 * Shared by the header and the Unsaved changes popup.
 */
export function SaveButton({ onSaved, ...props }: ButtonProps & { onSaved?: () => void }) {
  const dispatch = useAppDispatch();
  const hasProject = useAppSelector(selectHasProject);
  const dirty = useAppSelector(selectIsDirty);
  const saving = useAppSelector(s => s.master.saveStatus === SAVE_STATUSES.SAVING);
  return (
    <Button
      variant={dirty ? 'solid' : 'outline'}
      {...props}
      loading={saving}
      disabled={!hasProject || !dirty}
      onClick={() =>
        void dispatch(saveMaster()).then(result => {
          if (saveMaster.fulfilled.match(result)) {
            toaster.create({ title: SAVED_TOAST });
            onSaved?.();
          }
        })
      }
    >
      Save
    </Button>
  );
}
