import { useCallback } from 'react';

import { DIALOG_KINDS, useOpenDialog, type ConfirmOptions } from './dialogContext.ts';

/** Resolves true when the user confirms, false when they cancel or dismiss. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const open = useOpenDialog();
  return useCallback(options => open(DIALOG_KINDS.CONFIRM, options), [open]);
}
