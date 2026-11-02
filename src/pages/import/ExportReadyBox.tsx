import { Box, Heading, List, Stack, Text } from '@chakra-ui/react';
import { useId, type DragEvent, type ReactNode } from 'react';

import type { RecognizedFiles } from '@/entities/master/lib/analyzeImport.ts';
import { plural } from '@/entities/master/ui/statusText.ts';
import { formatDate } from '@/shared/lib/dates.ts';

import { exportFilesText, type ExportFileInfo } from './importText.ts';

/** Handlers that let files be dropped on a box; `dragging` turns its frame blue. */
export interface DropTarget {
  dragging: boolean;
  onDragOver: (event: DragEvent) => void;
  onDragLeave: (event: DragEvent) => void;
  onDrop: (event: DragEvent) => void;
}

function Row({ mark, label, value }: { mark: string; label: string; value: string }) {
  return (
    <List.Item minH="11" px="3" gap="2.5" display="flex" alignItems="center" borderTopWidth="1px">
      <Text as="span" w="3.5" color={mark === '–' ? 'fg.muted' : 'ink'} aria-hidden="true">
        {mark}
      </Text>
      <Text as="span" flex="1">
        {label}
      </Text>
      <Text as="span" textStyle="small" color="fg.muted">
        {value}
      </Text>
    </List.Item>
  );
}

/**
 * Shown instead of the file box once both Following and Followers are found: what will be imported. `masterOlder`
 * marks the master row with ⚠; `children` (the master warning) goes under the rows.
 */
export function ExportReadyBox({
  followingCount,
  followerCount,
  master,
  masterOlder,
  exportFiles,
  drop,
  children,
}: {
  followingCount: number;
  followerCount: number;
  master: RecognizedFiles['master'];
  masterOlder: boolean;
  exportFiles: readonly ExportFileInfo[];
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
      borderColor={drop.dragging ? 'accent' : 'border'}
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
    >
      <Stack gap="0.5" px="3" pt="4" pb="3">
        <Heading as="h2" id={titleId} textStyle="heading" color={drop.dragging ? 'accent' : 'ink'}>
          {drop.dragging ? 'Drop to add' : 'Your export is ready'}
        </Heading>
        <Text textStyle="small" color="fg.muted">
          {exportFilesText(exportFiles)}
        </Text>
      </Stack>
      <List.Root listStyle="none">
        <Row mark="✓" label="Following found" value={plural(followingCount, 'account')} />
        <Row mark="✓" label="Followers found" value={plural(followerCount, 'account')} />
        {master ? (
          <Row
            mark={masterOlder ? '⚠' : '✓'}
            label="Master file"
            value={master.savedAt ? `Selected · ${formatDate(master.savedAt)}` : 'Selected'}
          />
        ) : (
          <Row mark="–" label="Master file" value="Not selected" />
        )}
      </List.Root>
      {children && (
        <Box mx="3" mb="3">
          {children}
        </Box>
      )}
    </Stack>
  );
}
