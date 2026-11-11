import { Button, type ButtonProps } from '@chakra-ui/react';

import { selectHasProject, selectIsDirty, selectIsSaving, saveMaster } from '@/entities/master';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';
import { toaster } from '@/shared/ui/toasts.ts';

export const SAVED_TOAST = '✓ Progress file downloaded. Add it next time.';

/**
 * Black while there is something to save, outlined once saved. `onSaved` runs after a save that worked; `children`
 * replaces the label "Save". Shared by the header, the Unsaved changes popup and the This tab stopped page.
 */
export function SaveButton({ onSaved, children, ...props }: ButtonProps & { onSaved?: () => void }) {
  const dispatch = useAppDispatch();
  const hasProject = useAppSelector(selectHasProject);
  const dirty = useAppSelector(selectIsDirty);
  const isSaving = useAppSelector(selectIsSaving);
  return (
    <Button
      variant={dirty ? 'solid' : 'outline'}
      {...props}
      loading={isSaving}
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
      {children ?? 'Save'}
    </Button>
  );
}
