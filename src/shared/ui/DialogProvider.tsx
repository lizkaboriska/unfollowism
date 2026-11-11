import { Button, Dialog, Portal } from '@chakra-ui/react';
import { useCallback, useRef, useState, type ReactNode } from 'react';

import { DialogContext, type ConfirmOptions, type OpenDialogFn } from './dialogContext.ts';

/** Shows the dialogs that useConfirm opens, one at a time. */
export function DialogProvider({ children }: { children: ReactNode }) {
  // The last dialog stays in state after closing so its text doesn't vanish during the close animation.
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  /** Answers the dialog on screen; null once it has been answered. */
  const pending = useRef<((confirmed: boolean) => void) | null>(null);

  const open = useCallback<OpenDialogFn>(
    options =>
      new Promise(resolve => {
        pending.current?.(false); // a dialog opened over another one cancels it, so its caller isn't left waiting
        pending.current = resolve;
        setDialog(options);
        setIsOpen(true);
      }),
    [],
  );

  function close(isConfirmed: boolean) {
    if (!pending.current) {
      return;
    }
    pending.current(isConfirmed);
    pending.current = null;
    setIsOpen(false);
  }

  return (
    <DialogContext value={open}>
      {children}
      <Dialog.Root
        open={isOpen}
        onOpenChange={details => {
          if (!details.open) {
            close(false);
          }
        }}
        role="alertdialog"
        placement="center"
      >
        <Portal>
          <Dialog.Backdrop />
          <Dialog.Positioner>
            <Dialog.Content mx="4">
              <Dialog.Header>
                <Dialog.Title textStyle="heading">{dialog?.title}</Dialog.Title>
              </Dialog.Header>
              <Dialog.Body>{dialog?.body}</Dialog.Body>
              {/* Buttons stacked full width, the main one first; one that throws work away is outlined in red. */}
              <Dialog.Footer flexDirection="column" alignItems="stretch" gap="2">
                <Button
                  h="11"
                  {...(dialog?.isDestructive ? { variant: 'outline', colorPalette: 'danger' } : {})}
                  onClick={() => {
                    close(true);
                  }}
                >
                  {dialog?.confirmLabel}
                </Button>
                <Button
                  h="11"
                  variant="outline"
                  onClick={() => {
                    close(false);
                  }}
                >
                  Cancel
                </Button>
              </Dialog.Footer>
            </Dialog.Content>
          </Dialog.Positioner>
        </Portal>
      </Dialog.Root>
    </DialogContext>
  );
}
