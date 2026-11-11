import { Button } from '@chakra-ui/react';

import { Warning } from '@/shared/ui/Warning.tsx';

import type { MissingWarning } from './importText.ts';

/** Which files are still missing, with How? to open how to get the Instagram data. */
export function MissingFilesWarning({ missing, onHow }: { missing: MissingWarning; onHow: () => void }) {
  return (
    <Warning title={missing.title}>
      {missing.body}{' '}
      <Button
        variant="plain"
        h="auto"
        p="0"
        color="fg"
        textDecoration="underline"
        textUnderlineOffset="3px"
        verticalAlign="baseline"
        onClick={onHow}
      >
        How?
      </Button>
    </Warning>
  );
}
