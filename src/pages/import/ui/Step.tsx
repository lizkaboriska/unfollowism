import { List, Stack, Text } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/** A numbered step in the import popups: the number in the heading font, the text beside it. */
export function Step({ number, children }: { number: number; children: ReactNode }) {
  return (
    <List.Item display="flex" gap="3">
      <Text as="span" fontFamily="heading" fontSize="md" fontWeight="500" w="3.5" flexShrink="0">
        {number}
      </Text>
      <Stack gap="0" flex="1">
        {children}
      </Stack>
    </List.Item>
  );
}
