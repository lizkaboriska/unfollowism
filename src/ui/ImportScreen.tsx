import { Alert, Box, Button, HStack, Heading, List, Stack, Text } from '@chakra-ui/react';
import { useId, useMemo, useRef, useState, type ChangeEvent, type DragEvent } from 'react';

import { ImportError } from '../core/index.ts';
import { IMPORT_WARNINGS, analyzeImport, type ImportSelection } from '../io/analyzeImport.ts';
import type { LastSavedStore } from '../io/lastSaved.ts';
import { readInputs, type InputText } from '../io/readInputs.ts';
import { useAppDispatch, useAppSelector } from '../store/hooks.ts';
import { selectIsDirty } from '../store/selectors.ts';
import { IMPORT_STATUSES } from '../store/statuses.ts';
import { importPrepared } from '../store/thunks.ts';

import { useConfirm } from './dialogHooks.ts';
import { ExportReadyBox } from './ExportReadyBox.tsx';
import { importProblemText } from './importProblemText.ts';
import { missingText, noMasterConfirmText, olderMasterText } from './importText.ts';
import { errorMessage } from './statusText.ts';

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

  async function choose(files: File[]) {
    if (!files.length) {
      return;
    }
    setImportError(null);
    setReading(n => n + 1);
    try {
      const read = await Promise.all(files.map(readChosen));
      setChosen(current => {
        const next = [...current];
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
    void choose(files);
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
    const noMaster = prepared.warnings.find(w => w.kind === IMPORT_WARNINGS.NO_MASTER_BUT_SAVED_BEFORE);
    if (noMaster) {
      const proceed = await confirm({
        title: 'Import without your master?',
        body: noMasterConfirmText(noMaster.lastKnownSavedAt),
        confirmLabel: 'Import anyway',
        destructive: true,
      });
      if (!proceed) {
        return;
      }
    }
    if (dirty) {
      const discard = await confirm({
        title: 'Discard unsaved changes?',
        body:
          "Your changes since the last save aren't in a downloaded master yet. Importing replaces them. " +
          'To keep them, cancel and Save master first.',
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

  const missing = selection && missingText(selection.recognized);
  const { followingCount = null, followerCount = null, master = null } = selection?.recognized ?? {};
  const masterPath = master?.path;
  // The export's files: everything readable except the file holding the master.
  const exportFiles = chosen.filter(c => !c.readError && !c.inputs.some(i => i.path === masterPath));
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

  return (
    <Stack gap="5">
      {restoreFailed && (
        <Alert.Root status="warning">
          <Alert.Indicator />
          <Alert.Title>
            Your work in this tab from before the reload couldn't be restored. Add your Instagram export and your last
            saved master to continue.
          </Alert.Title>
        </Alert.Root>
      )}
      {!chosen.length && (
        <List.Root as="ol" listStyle="none" borderWidth="1px">
          {[
            'Download your Instagram data (JSON)',
            'Choose the .zip here',
            'Add your saved master file, if you have one',
          ].map((step, i) => (
            <List.Item
              key={step}
              minH="11"
              px="3"
              gap="3"
              display="flex"
              alignItems="center"
              borderTopWidth={i ? '1px' : '0'}
            >
              <Text as="span" fontFamily="heading" fontSize="md" fontWeight="500" w="3.5">
                {i + 1}
              </Text>
              {step}
            </List.Item>
          ))}
        </List.Root>
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
          exportFiles={exportFiles}
          drop={drop}
        />
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
          <Heading as="h2" id={fileBoxTitleId} textStyle="sheetTitle" color={dragging ? 'accent' : 'ink'}>
            {dragging ? 'Drop to add' : 'A fresh start for your feed'}
          </Heading>
          <Text color="fg.muted">Choose your Instagram .zip, or drop it here on a computer.</Text>
          <Button
            w="full"
            mt="2"
            loading={reading > 0}
            loadingText="Reading files…"
            onClick={() => fileInput.current?.click()}
          >
            Choose files
          </Button>
        </Stack>
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
              onClick={() => fileInput.current?.click()}
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

      {missing && <Text color="fg.muted">{missing}</Text>}

      {selection?.prepared?.warnings.map(
        w =>
          w.kind === IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE && (
            <Alert.Root key={w.kind} status="warning">
              <Alert.Indicator />
              <Alert.Title>{olderMasterText(w)}</Alert.Title>
            </Alert.Root>
          ),
      )}

      {(
        [
          ['selection', selectionError],
          ['import', importError],
        ] as const
      ).map(
        ([key, message]) =>
          message && (
            <Alert.Root key={key} status="error">
              <Alert.Indicator />
              <Alert.Title>{message}</Alert.Title>
            </Alert.Root>
          ),
      )}

      <Stack gap="2" align="center">
        <Button
          w="full"
          disabled={!selection?.prepared || reading > 0}
          loading={importing}
          loadingText="Importing…"
          onClick={() => void onImport()}
        >
          Import
        </Button>
        {onCancel && (
          <Button variant="plain" h="auto" py="2" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </Stack>

      {!chosen.length && (
        <Box>
          <Text textStyle="control">You're always in control</Text>
          <Text color="fg.muted">
            We only help you make a plan. You make any changes yourself in Instagram. Save downloads your decisions as a
            small master file.
          </Text>
        </Box>
      )}
      <Text textStyle="small" color="fg.muted" textAlign="center">
        No login. No Instagram connection. Just your files.
      </Text>
    </Stack>
  );
}
