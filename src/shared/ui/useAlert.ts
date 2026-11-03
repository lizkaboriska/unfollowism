import { useCallback } from 'react';

import { DIALOG_KINDS, useOpenDialog, type AlertOptions } from './dialogContext.ts';

/** Resolves when the user closes the message. */
export function useAlert(): (options: AlertOptions) => Promise<void> {
  const open = useOpenDialog();
  return useCallback(
    async options => {
      await open(DIALOG_KINDS.ALERT, { ...options, confirmLabel: 'OK' });
    },
    [open],
  );
}
