import { Alert, Text } from '@chakra-ui/react';

import { STATUS_EVENTS, statusText } from '@/entities/master';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

/** What last happened: the import message, or a warning box that stays while the last save failed. */
export function StatusLine() {
  const status = useAppSelector(s => s.master.status);
  const message = statusText(status);
  if (status?.type === STATUS_EVENTS.SAVE_FAILED) {
    return (
      <Alert.Root status="warning" role="alert">
        <Alert.Content>
          <Alert.Title textStyle="control">⚠ Couldn't save the progress file</Alert.Title>
          <Alert.Description color="fg.muted">{message}</Alert.Description>
        </Alert.Content>
      </Alert.Root>
    );
  }
  return message ? <Text>{message}</Text> : null;
}
