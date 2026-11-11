import { Alert } from '@chakra-ui/react';

import { selectHasData } from '@/entities/master';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

/** Shown when work wouldn't survive a reload: browser storage failed or isn't available. */
export function StorageWarning({ durable }: { durable: boolean }) {
  const failed = useAppSelector(s => s.master.persistenceFailed) || !durable;
  const hasData = useAppSelector(selectHasData);
  if (!failed || !hasData) {
    return null;
  }
  return (
    <Alert.Root status="warning" role="alert">
      <Alert.Content>
        <Alert.Title textStyle="control">⚠ This browser can't keep your work</Alert.Title>
        <Alert.Description color="fg.muted">
          Its storage is unavailable or full, so a reload would lose your edits. Tap Save at the top so your decisions
          don't get lost.
        </Alert.Description>
      </Alert.Content>
    </Alert.Root>
  );
}
