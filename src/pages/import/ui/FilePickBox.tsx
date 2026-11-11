import { Button, Heading, Stack, Text } from '@chakra-ui/react';
import { useId } from 'react';

import type { DropTarget } from '../lib/useDropZone.ts';

/**
 * The box to choose or drop files in, until they add up to an import (then ExportReadyBox shows instead).
 * `isOneFileMissing`: one of Following / Followers is there, the other isn't yet.
 */
export function FilePickBox({
  drop,
  isOneFileMissing,
  isReading,
  onChoose,
}: {
  drop: DropTarget;
  isOneFileMissing: boolean;
  isReading: boolean;
  onChoose: () => void;
}) {
  const titleId = useId();
  return (
    <Stack
      as="section"
      aria-labelledby={titleId}
      gap="2"
      align="center"
      borderWidth="1px"
      borderColor={drop.isDragging ? 'accent' : 'border'}
      px="5"
      pt="6"
      pb="5"
      textAlign="center"
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
    >
      <Heading as="h2" id={titleId} textStyle="heading" color={drop.isDragging ? 'accent' : 'ink'}>
        {drop.isDragging ? 'Drop to add' : isOneFileMissing ? "Let's find one more file" : 'Have your .zip?'}
      </Heading>
      <Text color="fg.muted">
        {isOneFileMissing
          ? 'Choose your Instagram .zip, or drop it here.'
          : 'Choose your Instagram .zip, or drop it here. Returning? Add your saved progress file too.'}
      </Text>
      <Button w="full" mt="2" loading={isReading} loadingText="Reading files…" onClick={onChoose}>
        Choose files
      </Button>
    </Stack>
  );
}
