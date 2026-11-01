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

  async function reset() {
    const confirmed = await confirm({
      title: 'Reset changes?',
      body:
        `Changes to ${plural(unsavedCount, 'account')} since your last save ` +
        "(or since the import, if you haven't saved since) will be undone.",
      confirmLabel: 'Reset',
      destructive: true,
    });
    if (confirmed) {
      dispatch(resetChanges());
    }
  }

  return { canReset: unsavedCount > 0 && !saving, reset };
}
