import { Button, type ButtonProps } from '@chakra-ui/react';

import { useResetChanges } from './useResetChanges.tsx';

/** Outlined in red: it throws work away. `onReset` runs once the changes were reset. */
export function ResetButton({ onReset, ...props }: ButtonProps & { onReset?: () => void }) {
  const { canReset, reset } = useResetChanges();
  return (
    <Button
      variant="outline"
      colorPalette="danger"
      {...props}
      disabled={!canReset}
      onClick={() =>
        void reset().then(done => {
          if (done) {
            onReset?.();
          }
        })
      }
    >
      Reset changes
    </Button>
  );
}
