import { Button, HStack, List, Stack, Text } from '@chakra-ui/react';

import { TextButton } from '@/shared/ui/TextButton.tsx';

import type { ChosenFile } from '../model/useImportSelection.ts';

/** The chosen files, each with × to remove it (and why it couldn't be read), then Add more files · Clear all. */
export function ChosenFileList({
  files,
  isReading,
  onRemove,
  onAddMore,
  onClearAll,
}: {
  files: readonly ChosenFile[];
  isReading: boolean;
  onRemove: (id: string) => void;
  onAddMore: () => void;
  onClearAll: () => void;
}) {
  return (
    <Stack gap="1">
      <List.Root listStyle="none">
        {files.map(file => (
          <List.Item key={file.id} display="flex" alignItems="center" gap="2" minH="10">
            <Stack gap="0" flex="1" minW="0">
              <Text truncate>{file.name}</Text>
              {file.readError && (
                <Text textStyle="small" color="fg.error">
                  {file.readError}
                </Text>
              )}
            </Stack>
            <Button
              variant="plain"
              w="10"
              h="10"
              minW="10"
              p="0"
              textStyle="name"
              aria-label={`Remove ${file.name}`}
              onClick={() => {
                onRemove(file.id);
              }}
            >
              ×
            </Button>
          </List.Item>
        ))}
      </List.Root>
      <HStack gap="2" textStyle="body">
        <TextButton loading={isReading} loadingText="Reading files…" onClick={onAddMore}>
          Add more files
        </TextButton>
        <Text as="span" color="fg.muted" aria-hidden="true">
          ·
        </Text>
        <TextButton onClick={onClearAll}>Clear all</TextButton>
      </HStack>
    </Stack>
  );
}
