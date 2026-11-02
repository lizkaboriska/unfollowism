import { Alert } from '@chakra-ui/react';
import type { ReactNode } from 'react';

/**
 * The design's warning: a framed box with a "⚠ …" title and muted text. `error` (something failed) keeps the red
 * frame for now.
 */
export function Warning({
  title,
  children,
  status = 'warning',
}: {
  title: string;
  children: ReactNode;
  status?: 'warning' | 'error';
}) {
  return (
    <Alert.Root status={status} role="alert">
      <Alert.Content>
        <Alert.Title textStyle="control">⚠ {title}</Alert.Title>
        <Alert.Description color="fg.muted">{children}</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}
