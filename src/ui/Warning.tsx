import { Alert, HStack } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * The design's warning: a framed box with a "⚠ …" title, muted text and optional outlined buttons (`actions`).
 * `error` (something failed) keeps the red frame for now.
 */
export function Warning({
  title,
  children,
  actions,
  status = 'warning',
}: {
  title: string;
  children: ReactNode;
  actions?: ReactNode;
  status?: 'warning' | 'error';
}) {
  return (
    <Alert.Root status={status} role="alert">
      <Alert.Content>
        <Alert.Title textStyle="control">⚠ {title}</Alert.Title>
        <Alert.Description color="fg.muted">{children}</Alert.Description>
        {actions && (
          <HStack gap="2" mt="2" w="full">
            {actions}
          </HStack>
        )}
      </Alert.Content>
    </Alert.Root>
  );
}
