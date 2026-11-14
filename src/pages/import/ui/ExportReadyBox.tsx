import { Box, Button, Heading, HStack, List, Stack, Text } from '@chakra-ui/react';
import { useId, type ReactNode } from 'react';

import type { RecognizedFiles } from '@/entities/master';
import { formatDate } from '@/shared/lib/dates.ts';
import { plural } from '@/shared/lib/plural.ts';

import type { DropTarget } from '../lib/useDropZone.ts';

/** One line of the box: a mark (✓, ⚠ or –), what it is, and the details under it. */
function Row({ mark, label, value }: { mark: string; label: string; value: string }) {
  return (
    <List.Item minH="11" px="3" py="2" gap="2.5" display="flex" alignItems="center" borderTopWidth="1px">
      <Text as="span" w="3.5" color={mark === '–' ? 'fg.muted' : 'ink'} aria-hidden="true">
        {mark}
      </Text>
      <Stack as="span" gap="0" flex="1">
        <Text as="span">{label}</Text>
        <Text as="span" textStyle="small" color="fg.muted">
          {value}
        </Text>
      </Stack>
    </List.Item>
  );
}

/** The work in this browser, shown instead of the progress file row when none is chosen (see browserWorkText). */
export interface BrowserWorkRow {
  details: string;
  /** Opens the file picker for a progress file. */
  onAddProgressFile: () => void;
}

/**
 * Shown instead of the file box once both Following and Followers are found: what will be imported. `isMasterOlder`
 * marks the master row with ⚠; `browserWork` replaces the master row with the work in this browser and asks for a
 * newer progress file; `children` (the master warning) goes under the rows.
 */
export function ExportReadyBox({
  followingCount,
  followerCount,
  master,
  isMasterOlder,
  browserWork,
  drop,
  children,
}: {
  followingCount: number;
  followerCount: number;
  master: RecognizedFiles['master'];
  isMasterOlder: boolean;
  browserWork: BrowserWorkRow | null;
  drop: DropTarget;
  children?: ReactNode;
}) {
  const titleId = useId();
  return (
    <Stack
      as="section"
      aria-labelledby={titleId}
      gap="0"
      borderWidth="1px"
      borderColor={drop.isDragging ? 'accent' : 'border'}
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
    >
      <Heading as="h2" id={titleId} textStyle="heading" color={drop.isDragging ? 'accent' : 'ink'} px="3" pt="4" pb="3">
        {drop.isDragging ? 'Drop to add' : 'Your files are ready'}
      </Heading>
      <List.Root listStyle="none">
        <Row
          mark="✓"
          label="Instagram data"
          value={`${String(followingCount)} following · ${plural(followerCount, 'follower')}`}
        />
        {browserWork ? (
          <Row mark="✓" label="Your work in this browser" value={browserWork.details} />
        ) : master ? (
          <Row
            mark={isMasterOlder ? '⚠' : '✓'}
            label="Progress file"
            value={master.savedAt ? `backed up ${formatDate(master.savedAt)}` : 'selected'}
          />
        ) : (
          <Row mark="–" label="Progress file" value="not selected" />
        )}
      </List.Root>
      {browserWork && (
        <HStack gap="3" p="3" borderTopWidth="1px">
          <Text flex="1" color="fg.muted">
            Have a newer progress file?
          </Text>
          <Button variant="outline" px="3" onClick={browserWork.onAddProgressFile}>
            Add progress file
          </Button>
        </HStack>
      )}
      {children && (
        <Box mx="3" mb="3">
          {children}
        </Box>
      )}
    </Stack>
  );
}
