import { createContext, useContext, type ReactNode } from 'react';

/**
 * Promise-based dialogs: `if (await confirm({ … })) …` instead of wiring open state
 * into every component. One dialog is shown at a time, by DialogProvider.
 */

export interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  /** Shows the confirm button in red, for actions that throw work away. */
  isDestructive?: boolean;
}

export type OpenDialogFn = (options: ConfirmOptions) => Promise<boolean>;

/** Provided by DialogProvider. */
export const DialogContext = createContext<OpenDialogFn | null>(null);

/** The DialogProvider's open function, for useConfirm. */
export function useOpenDialog(): OpenDialogFn {
  const open = useContext(DialogContext);
  if (!open) {
    throw new Error('Dialogs need a DialogProvider above them');
  }
  return open;
}
