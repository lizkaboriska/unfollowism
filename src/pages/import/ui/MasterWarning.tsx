import { Button, Grid, Text } from '@chakra-ui/react';

import { IMPORT_WARNINGS, type ImportWarning } from '@/entities/master';
import { Warning } from '@/shared/ui/Warning.tsx';

import { olderMasterDates, olderMasterText, savedMasterMissingText } from './importText.ts';

/**
 * The master warning inside the ready box, with its two answers. `onAddMaster` opens the file picker (for an older
 * master, the picked file replaces it); `onDismiss` hides the warning.
 */
export function MasterWarning({
  warning,
  onAddMaster,
  onDismiss,
}: {
  warning: ImportWarning;
  onAddMaster: () => void;
  onDismiss: () => void;
}) {
  const buttons = (add: string, dismiss: string) => (
    <>
      <Button variant="outline" flex="1" onClick={onAddMaster}>
        {add}
      </Button>
      <Button variant="outline" px="3" onClick={onDismiss}>
        {dismiss}
      </Button>
    </>
  );
  if (warning.kind === IMPORT_WARNINGS.NO_MASTER_BUT_SAVED_BEFORE) {
    return (
      <Warning title="Have your progress file?" actions={buttons('Add progress file', 'Start fresh')}>
        {savedMasterMissingText(warning.lastKnownSavedAt)}
      </Warning>
    );
  }
  const dates = olderMasterDates(warning);
  return (
    <Warning title="This progress file is older" actions={buttons('Choose newer file', 'Use older file')}>
      <Grid as="dl" templateColumns="auto minmax(0, 1fr)" columnGap="3" rowGap="0.5" my="0.5">
        <Text as="dt">Selected file</Text>
        <Text as="dd" color="ink">
          {dates.selected ?? 'Not dated'}
        </Text>
        <Text as="dt">Last backup</Text>
        <Text as="dd" color="ink">
          {dates.lastSaved}
        </Text>
      </Grid>
      {olderMasterText(dates)}
    </Warning>
  );
}
