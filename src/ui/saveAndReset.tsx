import { Button, type ButtonProps } from '@chakra-ui/react';

import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { selectHasProject, selectIsDirty } from '../store/selectors.ts';
import { SAVE_STATUSES } from '../store/statuses.ts';
import { saveMaster } from '../store/thunks.ts';

import { useResetChanges } from './resetHooks.tsx';

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
      onClick={() => void dispatch(saveMaster())}
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
