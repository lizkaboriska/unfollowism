import { Alert } from '@chakra-ui/react';

import { STATUS_EVENTS, statusText } from '@/entities/master';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

/** A warning box that stays while the last save failed; nothing otherwise. */
export function StatusLine() {
  const status = useAppSelector(s => s.master.status);
  if (status?.type !== STATUS_EVENTS.SAVE_FAILED) {
    return null;
  }
  return (
    <Alert.Root status="warning" role="alert">
      <Alert.Content>
        <Alert.Title textStyle="control">⚠ Couldn't save the progress file</Alert.Title>
        <Alert.Description color="fg.muted">{statusText(status)}</Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}
