import { createToaster } from '@chakra-ui/react';

/** Short messages that need no answer, shown by Toaster (Toaster.tsx): gone after a few seconds. */
export const toaster = createToaster({
  placement: 'bottom',
  duration: 4000,
  // 84px clears the phone's bottom navigation.
  offsets: { top: '16px', right: '16px', bottom: '84px', left: '16px' },
});
