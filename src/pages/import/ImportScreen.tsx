import { Grid, Button, HStack, Heading, List, Stack, Text } from '@chakra-ui/react';
import { useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import {
  IMPORT_STATUSES,
  IMPORT_WARNINGS,
  ImportError,
  analyzeImport,
  errorMessage,
  importPrepared,
  selectIsDirty,
  type ImportSelection,
  type ImportWarning,
  type LastSavedStore,
} from '@/entities/master';
import { readInputs, type InputText } from '@/shared/lib/readInputs.ts';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';
import { useConfirm } from '@/shared/ui/useConfirm.ts';
import { Warning } from '@/shared/ui/Warning.tsx';

import { ExportReadyBox } from './ExportReadyBox.tsx';
import { HowItWorksPopup } from './HowItWorksPopup.tsx';
import { HowItWorksView } from './howItWorksView.ts';
import { importProblemText } from './importProblemText.ts';
import { missingWarning, olderMasterDates, olderMasterText, savedMasterMissingText } from './importText.ts';

/** One file the user chose (a .zip counts as one), with the text files read from it. */
interface ChosenFile {
  /** Name + size + modified time: choosing the same file again is ignored. */
  id: string;
  name: string;
  size: number;
  lastModified: number;
  inputs: InputText[];
  /** Why the file couldn't be read (e.g. a broken zip); it then contributes nothing. */
  readError: string | null;
}

async function readChosen(file: File): Promise<ChosenFile> {
  const base = {
    id: `${file.name}:${file.size}:${file.lastModified}`,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
  };
  try {
    return { ...base, inputs: await readInputs([file]), readError: null };
  } catch (e) {
    return { ...base, inputs: [], readError: errorMessage(e) };
  }
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
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  const fileBoxTitleId = useId();
  const dirty = useAppSelector(selectIsDirty);
  const importing = useAppSelector(s => s.master.importStatus === IMPORT_STATUSES.IMPORTING);
  const restoreFailed = useAppSelector(s => s.master.restoreFailed);

  const fileInput = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<readonly ChosenFile[]>([]);
  const [reading, setReading] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  /** The How it works popup opened from a missing-files warning's How?; null = closed. */
  const [howView, setHowView] = useState<HowItWorksView | null>(null);
  /** The selection whose master warning was answered (Start fresh / Use older file); a new selection asks again. */
  const [warningDismissedFor, setWarningDismissedFor] = useState<readonly ChosenFile[] | null>(null);
  /** Set by "Choose newer master": the file the next pick replaces. */
  const replacing = useRef<string | null>(null);

  // Recomputed from all chosen files after every change. A conflict (e.g. two masters) keeps the list so a file can be
  // removed.
  // The last save from this browser is read here too, once per change rather than on every render.
  const { selection, selectionError } = useMemo((): {
    selection: ImportSelection | null;
    selectionError: string | null;
  } => {
    if (!chosen.length) {
      return { selection: null, selectionError: null };
    }
    try {
      return {
        selection: analyzeImport(
          chosen.flatMap(c => c.inputs),
          lastSaved.get(),
        ),
        selectionError: null,
      };
    } catch (e) {
      return {
        selection: null,
        selectionError: e instanceof ImportError ? importProblemText(e.problem) : errorMessage(e),
      };
    }
  }, [chosen, lastSaved]);

  /** Adds the files to the selection; `replaceId` (a chosen file) is removed at the same time. */
  async function choose(files: File[], replaceId: string | null = null) {
    if (!files.length) {
      return;
    }
    setImportError(null);
    setReading(n => n + 1);
    try {
      const read = await Promise.all(files.map(readChosen));
      setChosen(current => {
        const next = current.filter(c => c.id !== replaceId);
        for (const file of read) {
          if (!next.some(c => c.id === file.id)) {
            next.push(file);
          }
        }
        return next;
      });
    } finally {
      setReading(n => n - 1);
    }
  }

  function remove(id: string) {
    setImportError(null);
    setChosen(current => current.filter(c => c.id !== id));
  }

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

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void choose([...event.dataTransfer.files]);
  }

  async function onImport() {
    const prepared = selection?.prepared;
    if (!prepared) {
      return;
    }
    if (dirty) {
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
    setImportError(null);
    const result = await dispatch(importPrepared(prepared));
    if (importPrepared.fulfilled.match(result)) {
      onImported();
    } else {
      setImportError(result.payload ? importProblemText(result.payload) : errorMessage(result.error));
    }
  }

  const { followingCount = null, followerCount = null, master = null } = selection?.recognized ?? {};
  const missing = selection && missingWarning(selection.recognized);
  // Exactly one of Following / Followers is there.
  const oneMissing = missing !== null && (followingCount !== null || followerCount !== null);
  const masterPath = master?.path;
  const drop = {
    dragging,
    onDragOver: (e: DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    // Moving over the text inside also fires dragleave; only leaving the box itself ends the highlight.
    onDragLeave: (e: DragEvent) => {
      if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) {
        setDragging(false);
      }
    },
    onDrop,
  };
  const masterWarning = warningDismissedFor === chosen ? null : (selection?.prepared?.warnings[0] ?? null);
  const masterFileId = chosen.find(c => c.inputs.some(i => i.path === masterPath))?.id ?? null;
  const dismissWarning = () => {
    setWarningDismissedFor(chosen);
  };

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
        <Stack
          as="section"
          aria-labelledby={fileBoxTitleId}
          gap="2"
          align="center"
          borderWidth="1px"
          borderColor={dragging ? 'accent' : 'border'}
          px="5"
          pt="6"
          pb="5"
          textAlign="center"
          onDragOver={drop.onDragOver}
          onDragLeave={drop.onDragLeave}
          onDrop={drop.onDrop}
        >
          <Heading as="h2" id={fileBoxTitleId} textStyle="heading" color={dragging ? 'accent' : 'ink'}>
            {dragging ? 'Drop to add' : oneMissing ? "Let's find one more file" : 'Have your .zip?'}
          </Heading>
          <Text color="fg.muted">
            {oneMissing
              ? 'Choose your Instagram .zip, or drop it here.'
              : 'Choose your Instagram .zip, or drop it here. Returning? Add your saved progress file too.'}
          </Text>
          <Button
            w="full"
            mt="2"
            loading={reading > 0}
            loadingText="Reading files…"
            onClick={() => {
              pickFiles();
            }}
          >
            Choose files
          </Button>
        </Stack>
      )}
      {missing && (
        <Warning title={missing.title}>
          {missing.body}{' '}
          <Button
            variant="plain"
            h="auto"
            p="0"
            color="fg"
            textDecoration="underline"
            textUnderlineOffset="3px"
            verticalAlign="baseline"
            onClick={() => {
              setHowView(HowItWorksView.EXPORT);
            }}
          >
            How?
          </Button>
        </Warning>
      )}
      <HowItWorksPopup
        view={howView}
        onView={setHowView}
        onClose={() => {
          setHowView(null);
        }}
      />
      {selectionError && (
        <Warning title="These files can't be used" status="error">
          {selectionError}
        </Warning>
      )}
      {importError && (
        <Warning title="Import failed" status="error">
          {importError}
        </Warning>
      )}

      {chosen.length > 0 && (
        <Stack gap="1">
          <List.Root listStyle="none">
            {chosen.map(c => (
              <List.Item key={c.id} display="flex" alignItems="center" gap="2" minH="10">
                <Stack gap="0" flex="1" minW="0">
                  <Text truncate>{c.name}</Text>
                  {c.readError && (
                    <Text textStyle="small" color="fg.error">
                      {c.readError}
                    </Text>
                  )}
                </Stack>
                <Button
                  variant="plain"
                  w="10"
                  h="10"
                  minW="10"
                  p="0"
                  textStyle="name"
                  aria-label={`Remove ${c.name}`}
                  onClick={() => {
                    remove(c.id);
                  }}
                >
                  ×
                </Button>
              </List.Item>
            ))}
          </List.Root>
          <HStack gap="2" textStyle="body">
            <Button
              variant="plain"
              h="auto"
              p="0"
              textDecoration="underline"
              textUnderlineOffset="3px"
              loading={reading > 0}
              loadingText="Reading files…"
              onClick={() => {
                pickFiles();
              }}
            >
              Add more files
            </Button>
            <Text as="span" color="fg.muted" aria-hidden="true">
              ·
            </Text>
            <Button
              variant="plain"
              h="auto"
              p="0"
              textDecoration="underline"
              textUnderlineOffset="3px"
              onClick={() => {
                setChosen([]);
                setImportError(null);
              }}
            >
              Clear all
            </Button>
          </HStack>
        </Stack>
      )}

      <Stack gap="2" align="center">
        <Button
          w="full"
          disabled={!selection?.prepared || reading > 0}
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

/**
 * The master warning inside the ready box, with its two answers. `onAddMaster` opens the file picker (for an older
 * master, the picked file replaces it); `onDismiss` hides the warning.
 */
function MasterWarning({
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
        <Text as="dt">Last saved</Text>
        <Text as="dd" color="ink">
          {dates.lastSaved}
        </Text>
      </Grid>
      {olderMasterText(dates)}
    </Warning>
  );
}
