import { Button, HStack, Stack, Text } from '@chakra-ui/react';
import { useRef, useState, type ChangeEvent } from 'react';

import {
  IMPORT_STATUSES,
  IMPORT_WARNINGS,
  selectIsDirty,
  selectUnsavedAccountCount,
  type LastSavedStore,
} from '@/entities/master';
import { plural } from '@/shared/lib/plural.ts';
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
import { browserWorkText, missingWarning } from './importText.ts';
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
  const isImporting = useAppSelector(state => state.master.importStatus === IMPORT_STATUSES.IMPORTING);
  const hasRestoreFailed = useAppSelector(state => state.master.hasRestoreFailed);
  const savedAt = useAppSelector(state => state.master.savedAt);
  const unsavedCount = useAppSelector(selectUnsavedAccountCount);
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
    isIntoBrowserWork,
    startImport,
    startImportIntoWork,
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
    if (isIntoBrowserWork) {
      // Nothing is lost: the export goes into the work, changes not backed up included.
      if (await startImportIntoWork()) {
        onImported();
      }
      return;
    }
    if (isDirty) {
      const shouldDiscard = await confirm({
        title: 'Discard unsaved changes?',
        body:
          "Your changes since the last save aren't in a downloaded progress file yet. Importing replaces them. " +
          'To keep them, cancel and Save first.',
        confirmLabel: 'Import anyway',
        isDestructive: true,
      });
      if (!shouldDiscard) {
        return;
      }
    }
    if (await startImport()) {
      onImported();
    }
  }

  /** Start fresh next to Update: asks first, then imports the export alone, without the work in this browser. */
  async function onStartFresh() {
    const isConfirmed = await confirm({
      title: 'Start fresh?',
      body: (
        <Stack gap="3">
          <Text>Your tags, notes, and choices in this browser will be replaced by the new Instagram data alone.</Text>
          {unsavedCount > 0 && <Text>Your changes to {plural(unsavedCount, 'account')} aren't backed up yet.</Text>}
          <Text>Your downloaded progress files stay as they are.</Text>
        </Stack>
      ),
      confirmLabel: 'Start fresh',
      isDestructive: true,
    });
    if (isConfirmed && (await startImport())) {
      onImported();
    }
  }

  const { followingCount = null, followerCount = null, master = null } = selection?.recognized ?? {};
  const missing = selection && missingWarning(selection.recognized);
  // Exactly one of Following / Followers is there.
  const isOneFileMissing = missing !== null && (followingCount !== null || followerCount !== null);

  return (
    <Stack gap="5">
      {hasRestoreFailed && (
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
          isMasterOlder={masterWarning?.kind === IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE}
          browserWork={
            isIntoBrowserWork
              ? {
                  details: browserWorkText({ savedAt, unsavedCount }),
                  onAddProgressFile: () => {
                    pickFiles();
                  },
                }
              : null
          }
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
        <HStack gap="2" w="full">
          <Button
            flex="1"
            disabled={!selection?.prepared || isReading}
            loading={isImporting}
            loadingText="Loading…"
            onClick={() => void onImport()}
          >
            {onCancel ? 'Update' : 'Start'}
          </Button>
          {isIntoBrowserWork && (
            <Button variant="outline" px="3" disabled={isImporting} onClick={() => void onStartFresh()}>
              Start fresh
            </Button>
          )}
        </HStack>
        {onCancel && (
          <Button variant="plain" h="auto" py="2" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </Stack>
    </Stack>
  );
}
