import { Button, type ButtonProps } from '@chakra-ui/react';

import { selectHasData, selectIsDirty, selectIsSaving, saveMaster } from '@/entities/master';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';
import { toaster } from '@/shared/ui/toasts.ts';

export const SAVED_TOAST = '✓ Backed up. Keep the downloaded progress file somewhere safe.';

/**
 * Black while there is something to save, outlined once saved. `onSaved` runs after a save that worked; `children`
 * replaces the label "Back up". Shared by the header, the Unsaved changes popup and the This tab stopped page.
 */
export function SaveButton({ onSaved, children, ...props }: ButtonProps & { onSaved?: () => void }) {
  const dispatch = useAppDispatch();
  const hasData = useAppSelector(selectHasData);
  const isDirty = useAppSelector(selectIsDirty);
  const isSaving = useAppSelector(selectIsSaving);
  return (
    <Button
      variant={isDirty ? 'solid' : 'outline'}
      {...props}
      loading={isSaving}
      disabled={!hasData || !isDirty}
      onClick={() =>
        void dispatch(saveMaster()).then(result => {
          if (saveMaster.fulfilled.match(result)) {
            toaster.create({ title: SAVED_TOAST });
            onSaved?.();
          }
        })
      }
    >
      {children ?? 'Back up'}
    </Button>
  );
}
