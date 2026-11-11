import { Button, Stack } from '@chakra-ui/react';
import { useRef, useState, type ChangeEvent } from 'react';

import { IMPORT_STATUSES, IMPORT_WARNINGS, selectIsDirty, type LastSavedStore } from '@/entities/master';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';
import { useConfirm } from '@/shared/ui/useConfirm.ts';
import { Warning } from '@/shared/ui/Warning.tsx';

import { useDropZone } from '../lib/useDropZone.ts';
import { useImportSelection, type ImportFailure } from '../model/useImportSelection.ts';

import { ChosenFileList } from './ChosenFileList.tsx';
import { ExportReadyBox } from './ExportReadyBox.tsx';
import { FilePickBox } from './FilePickBox.tsx';
import { HowItWorksPopup } from './HowItWorksPopup.tsx';
import { HowItWorksView } from './howItWorksView.ts';
import { importProblemText } from './importProblemText.ts';
import { missingWarning } from './importText.ts';
import { MasterWarning } from './MasterWarning.tsx';
import { MissingFilesWarning } from './MissingFilesWarning.tsx';

/** A failure as shown to the user. */
function failureText(failure: ImportFailure): string {
  return 'problem' in failure ? importProblemText(failure.problem) : failure.message;
}

/**
 * Choose or drop the export and the saved master, from any folders and in any order,
 * see what was recognized, then Import. Selections add up; each file can be removed.
 */
export function ImportScreen({
  lastSaved,
  onImported,
  onCancel,
}: {
  /** When a master was last saved from this browser, for the older-master warnings. */
  lastSaved: LastSavedStore;
  onImported: () => void;
  /** Shown as a Cancel button when there is already something loaded to go back to. */
  onCancel?: () => void;
}) {
  const confirm = useConfirm();
  const isDirty = useAppSelector(selectIsDirty);
  const importing = useAppSelector(state => state.master.importStatus === IMPORT_STATUSES.IMPORTING);
  const restoreFailed = useAppSelector(state => state.master.restoreFailed);
  const {
    chosen,
    isReading,
    selection,
    selectionFailure,
    importFailure,
    masterWarning,
    masterFileId,
    choose,
    remove,
    clearAll,
    startImport,
    dismissWarning,
  } = useImportSelection(lastSaved);

  const fileInput = useRef<HTMLInputElement>(null);
  /** The How it works popup opened from a missing-files warning's How?; null = closed. */
  const [howView, setHowView] = useState<HowItWorksView | null>(null);
  const drop = useDropZone(files => void choose(files));
  /** Set by "Choose newer master": the file the next pick replaces. */
  const replacing = useRef<string | null>(null);

  function onInput(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = ''; // allow choosing the same files again
    const replaceId = replacing.current;
    replacing.current = null;
    void choose(files, replaceId);
  }

  /** Opens the file picker; `replaceId` is the chosen file the picked one replaces. */
  function pickFiles(replaceId: string | null = null) {
    replacing.current = replaceId;
    fileInput.current?.click();
  }

  async function onImport() {
    if (!selection?.prepared) {
      return;
    }
    if (isDirty) {
      const discard = await confirm({
        title: 'Discard unsaved changes?',
        body:
          "Your changes since the last save aren't in a downloaded progress file yet. Importing replaces them. " +
          'To keep them, cancel and Save first.',
        confirmLabel: 'Import anyway',
        destructive: true,
      });
      if (!discard) {
        return;
      }
    }
    if (await startImport()) {
      onImported();
    }
  }

  const { followingCount = null, followerCount = null, master = null } = selection?.recognized ?? {};
  const missing = selection && missingWarning(selection.recognized);
  // Exactly one of Following / Followers is there.
  const isOneFileMissing = missing !== null && (followingCount !== null || followerCount !== null);

  return (
    <Stack gap="5">
      {restoreFailed && (
        <Warning title="Your work couldn't be restored">
          Your work in this tab from before the reload couldn't be read back. Add your Instagram export and your last
          saved progress file to continue.
        </Warning>
      )}

      <input
        ref={fileInput}
        name="files"
        type="file"
        multiple
        accept=".zip,.json,.html"
        hidden
        onChange={onInput}
        data-testid="file-input"
      />
      {selection?.prepared && followingCount !== null && followerCount !== null ? (
        <ExportReadyBox
          followingCount={followingCount}
          followerCount={followerCount}
          master={master}
          masterOlder={masterWarning?.kind === IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE}
          drop={drop}
        >
          {masterWarning && (
            <MasterWarning
              warning={masterWarning}
              onAddMaster={() => {
                pickFiles(masterFileId);
              }}
              onDismiss={dismissWarning}
            />
          )}
        </ExportReadyBox>
      ) : (
        <FilePickBox
          drop={drop}
          isOneFileMissing={isOneFileMissing}
          isReading={isReading}
          onChoose={() => {
            pickFiles();
          }}
        />
      )}
      {missing && (
        <MissingFilesWarning
          missing={missing}
          onHow={() => {
            setHowView(HowItWorksView.EXPORT);
          }}
        />
      )}
      <HowItWorksPopup
        view={howView}
        onView={setHowView}
        onClose={() => {
          setHowView(null);
        }}
      />
      {selectionFailure && (
        <Warning title="These files can't be used" status="error">
          {failureText(selectionFailure)}
        </Warning>
      )}
      {importFailure && (
        <Warning title="Import failed" status="error">
          {failureText(importFailure)}
        </Warning>
      )}

      {chosen.length > 0 && (
        <ChosenFileList
          files={chosen}
          isReading={isReading}
          onRemove={remove}
          onAddMore={() => {
            pickFiles();
          }}
          onClearAll={clearAll}
        />
      )}

      <Stack gap="2" align="center">
        <Button
          w="full"
          disabled={!selection?.prepared || isReading}
          loading={importing}
          loadingText="Loading…"
          onClick={() => void onImport()}
        >
          {onCancel ? 'Update' : 'Start'}
        </Button>
        {onCancel && (
          <Button variant="plain" h="auto" py="2" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
