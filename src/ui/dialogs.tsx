import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { Button, Dialog, Portal } from "@chakra-ui/react";
import type { ValueOf } from "../core/index.ts";

/**
 * Promise-based dialogs: `if (await confirm({ … })) …` instead of wiring open state
 * into every component. One dialog is shown at a time, by DialogProvider.
 */

const DIALOG_KINDS = { CONFIRM: "confirm", ALERT: "alert" } as const;
type DialogKind = ValueOf<typeof DIALOG_KINDS>;

export interface AlertOptions {
  title: string;
  body: ReactNode;
}

export interface ConfirmOptions extends AlertOptions {
  confirmLabel: string;
  /** Shows the confirm button in red, for actions that throw work away. */
  destructive?: boolean;
}

interface OpenDialog extends ConfirmOptions {
  kind: DialogKind;
}

type OpenDialogFn = (kind: DialogKind, options: ConfirmOptions) => Promise<boolean>;

const DialogContext = createContext<OpenDialogFn | null>(null);

export function DialogProvider({ children }: { children: ReactNode }) {
  // The last dialog stays in state after closing so its text doesn't vanish during the close animation.
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  /** Answers the dialog on screen; null once it has been answered. */
  const pending = useRef<((confirmed: boolean) => void) | null>(null);

  const open = useCallback<OpenDialogFn>((kind, options) => new Promise(resolve => {
    pending.current?.(false); // a dialog opened over another one cancels it, so its caller isn't left waiting
    pending.current = resolve;
    setDialog({ ...options, kind });
    setIsOpen(true);
  }), []);

  function close(confirmed: boolean) {
    if (!pending.current) return;
    pending.current(confirmed);
    pending.current = null;
    setIsOpen(false);
  }

  return (
    <DialogContext value={open}>
      {children}
      <Dialog.Root
        open={isOpen}
        onOpenChange={e => { if (!e.open) close(false); }}
        role={dialog?.kind === DIALOG_KINDS.CONFIRM ? "alertdialog" : "dialog"}
        placement="center"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content mx="4">
              <Dialog.Header>
                <Dialog.Title>{dialog?.title}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>{dialog?.body}</Dialog.Body>
              <Dialog.Footer>
                {dialog?.kind === DIALOG_KINDS.CONFIRM ? (
                  <>
                    <Button variant="outline" onClick={() => { close(false); }}>Cancel</Button>
                    <Button colorPalette={dialog.destructive ? "red" : "pink"} onClick={() => { close(true); }}>
                      {dialog.confirmLabel}
                    </Button>
                  </>
                ) : (
                  <Button colorPalette="pink" onClick={() => { close(true); }}>{dialog?.confirmLabel}</Button>
                )}
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </DialogContext>
  );
}

function useOpenDialog(): OpenDialogFn {
  const open = useContext(DialogContext);
  if (!open) throw new Error("Dialogs need a DialogProvider above them");
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
  return useCallback(async options => { await open(DIALOG_KINDS.ALERT, { ...options, confirmLabel: "OK" }); }, [open]);
}
