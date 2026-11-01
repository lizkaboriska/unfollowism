import { Button, type ButtonProps } from '@chakra-ui/react';

import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { selectHasProject, selectIsDirty } from '../store/selectors.ts';
import { SAVE_STATUSES } from '../store/statuses.ts';
import { saveMaster } from '../store/thunks.ts';

import { useResetChanges } from './resetHooks.tsx';
import { toaster } from './toasts.ts';

export const SAVED_TOAST = '✓ Master file downloaded. Keep it for your next import.';

/** Save and Reset changes, shared by the header and the Unsaved changes drawer. */

/** Black while there is something to save, outlined once saved. */
export function SaveButton(props: ButtonProps) {
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
          }
        })
      }
    >
      Save
    </Button>
  );
}

export function ResetButton(props: ButtonProps) {
  const { canReset, reset } = useResetChanges();
  return (
    <Button variant="outline" {...props} disabled={!canReset} onClick={() => void reset()}>
      Reset changes
    </Button>
  );
}
