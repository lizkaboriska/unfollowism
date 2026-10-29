import { createContext, useCallback, useContext, type ReactNode } from 'react';

import type { ValueOf } from '../core/index.ts';

/**
 * Promise-based dialogs: `if (await confirm({ … })) …` instead of wiring open state
 * into every component. One dialog is shown at a time, by DialogProvider (dialogs.tsx).
 */

export const DIALOG_KINDS = { CONFIRM: 'confirm', ALERT: 'alert' } as const;
export type DialogKind = ValueOf<typeof DIALOG_KINDS>;

export interface AlertOptions {
  title: string;
  body: ReactNode;
}

export interface ConfirmOptions extends AlertOptions {
  confirmLabel: string;
  /** Shows the confirm button in red, for actions that throw work away. */
  destructive?: boolean;
}

export type OpenDialogFn = (kind: DialogKind, options: ConfirmOptions) => Promise<boolean>;

/** Provided by DialogProvider. */
export const DialogContext = createContext<OpenDialogFn | null>(null);

function useOpenDialog(): OpenDialogFn {
  const open = useContext(DialogContext);
  if (!open) {
    throw new Error('Dialogs need a DialogProvider above them');
  }
  return open;
}

/** Resolves true when the user confirms, false when they cancel or dismiss. */
export function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  const open = useOpenDialog();
  return useCallback(options => open(DIALOG_KINDS.CONFIRM, options), [open]);
}

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
