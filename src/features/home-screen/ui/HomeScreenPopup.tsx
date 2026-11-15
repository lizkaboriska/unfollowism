import { CloseButton, Drawer, Portal, Stack } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * The bottom popup about the Home Screen app, like How it works: a title, the grey text and steps (`children`), and
 * `buttons` below. × and swiping it away call `onClose`.
 */
export function HomeScreenPopup({
  isOpen,
  title,
  buttons,
  onClose,
  children,
}: {
  isOpen: boolean;
  title: string;
  buttons: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Drawer.Root
      open={isOpen}
      onOpenChange={details => {
        if (!details.open) {
          onClose();
        }
      }}
      placement="bottom"
      lazyMount
      unmountOnExit
    >
      <Portal>
        <Drawer.Backdrop />
        <Drawer.Positioner>
          <Drawer.Content>
            <Drawer.Header>
              <Drawer.Title textStyle="heading">{title}</Drawer.Title>
            </Drawer.Header>
            <Drawer.Body>
              <Stack gap="3">{children}</Stack>
            </Drawer.Body>
            <Drawer.Footer flexDirection="column" alignItems="stretch" gap="2">
              {buttons}
            </Drawer.Footer>
            <Drawer.CloseTrigger asChild>
              <CloseButton variant="outline" aria-label="Close" />
            </Drawer.CloseTrigger>
          </Drawer.Content>
        </Drawer.Positioner>
      </Portal>
    </Drawer.Root>
  );
}
