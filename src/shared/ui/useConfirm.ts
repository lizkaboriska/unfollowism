import { useCallback } from 'react';

import { useOpenDialog, type ConfirmOptions } from './dialogContext.ts';

/** Resolves true when the user confirms, false when they cancel or dismiss. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const open = useOpenDialog();
  return useCallback(options => open(options), [open]);
}
