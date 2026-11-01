import { Portal, Toast, Toaster as ChakraToaster } from '@chakra-ui/react';

import { toaster } from './toasts.ts';

/** The toasts: black, white text, square, above the bottom nav. */
export function Toaster() {
  return (
    <Portal>
      <ChakraToaster toaster={toaster}>
        {toast => (
          <Toast.Root bg="ink" color="paper" borderRadius="0" boxShadow="none" px="4" py="3" width="auto">
            <Toast.Title textStyle="body">{toast.title}</Toast.Title>
          </Toast.Root>
        )}
      </ChakraToaster>
    </Portal>
  );
}
