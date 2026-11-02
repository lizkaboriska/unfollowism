import { createContext, useContext, type ReactNode } from 'react';

import type { ValueOf } from '@/shared/lib/valueOf.ts';

/**
 * Promise-based dialogs: `if (await confirm({ … })) …` instead of wiring open state
 * into every component. One dialog is shown at a time, by DialogProvider.
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

/** The DialogProvider's open function, for useConfirm and useAlert. */
export function useOpenDialog(): OpenDialogFn {
  const open = useContext(DialogContext);
  if (!open) {
    throw new Error('Dialogs need a DialogProvider above them');
  }
  return open;
}
