import { Alert } from '@chakra-ui/react';
import { useAppSelector } from '../store/hooks.ts';
import { selectHasProject } from '../store/selectors.ts';

/** Shown when work wouldn't survive a reload: browser storage failed or isn't available. */
export function StorageWarning({ durable }: { durable: boolean }) {
  const failed = useAppSelector(s => s.master.persistenceFailed) || !durable;
  const hasProject = useAppSelector(selectHasProject);
  if (!failed || !hasProject) return null;
  return (
    <Alert.Root status="warning">
      <Alert.Indicator />
      <Alert.Title>This browser isn't keeping your work: a reload would lose it. Save master to be safe.</Alert.Title>
    </Alert.Root>
  );
}
