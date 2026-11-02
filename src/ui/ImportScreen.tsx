import { Alert, Box, Button, HStack, Heading, IconButton, List, Stack, Text } from '@chakra-ui/react';
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
import { importProblemText } from './importProblemText.ts';
import { missingText, noMasterConfirmText, olderMasterText, recognizedText } from './importText.ts';
import { errorMessage } from './statusText.ts';

/** One file the user chose (a .zip counts as one), with the text files read from it. */
interface ChosenFile {
  /** Name + size + modified time: choosing the same file again is ignored. */
  id: string;
  name: string;
  inputs: InputText[];
  /** Why the file couldn't be read (e.g. a broken zip); it then contributes nothing. */
  readError: string | null;
}

async function readChosen(file: File): Promise<ChosenFile> {
  const base = { id: `${file.name}:${file.size}:${file.lastModified}`, name: file.name };
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
  const { selection, selectionError, lastKnownSavedAt } = useMemo((): {
    selection: ImportSelection | null;
    selectionError: string | null;
    lastKnownSavedAt: string | null;
  } => {
    if (!chosen.length) {
      return { selection: null, selectionError: null, lastKnownSavedAt: null };
    }
    const savedAt = lastSaved.get();
    try {
      return {
        selection: analyzeImport(
          chosen.flatMap(c => c.inputs),
          savedAt,
        ),
        selectionError: null,
        lastKnownSavedAt: savedAt,
      };
    } catch (e) {
      return {
        selection: null,
        selectionError: e instanceof ImportError ? importProblemText(e.problem) : errorMessage(e),
        lastKnownSavedAt: savedAt,
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
        onDragOver={e => {
          e.preventDefault();
          setDragging(true);
        }}
        // Moving over the text inside also fires dragleave; only leaving the box itself ends the highlight.
        onDragLeave={e => {
          if (!(e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget))) {
            setDragging(false);
          }
        }}
        onDrop={onDrop}
      >
        <Heading as="h2" id={fileBoxTitleId} textStyle="sheetTitle" color={dragging ? 'accent' : 'ink'}>
          {dragging ? 'Drop to add' : 'A fresh start for your feed'}
        </Heading>
        <Text color="fg.muted">Choose your Instagram .zip, or drop it here on a computer.</Text>
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

      {chosen.length > 0 && (
        <Stack gap="1">
          {chosen.map(c => (
            <HStack key={c.id} gap="2">
              <IconButton
                size="xs"
                variant="ghost"
                aria-label={`Remove ${c.name}`}
                onClick={() => {
                  remove(c.id);
                }}
              >
                ×
              </IconButton>
              <Text truncate>{c.name}</Text>
              {c.readError && (
                <Text color="fg.error" fontSize="sm">
                  {c.readError}
                </Text>
              )}
            </HStack>
          ))}
          <Box>
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setChosen([]);
                setImportError(null);
              }}
            >
              Clear all
            </Button>
          </Box>
        </Stack>
      )}

      {selection && <Text>{recognizedText(selection.recognized, lastKnownSavedAt)}</Text>}
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

      <HStack>
        <Button disabled={!selection?.prepared || reading > 0} loading={importing} onClick={() => void onImport()}>
          Import
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </HStack>
      {importing && <Text color="fg.muted">Importing… large accounts can take a few seconds.</Text>}

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
