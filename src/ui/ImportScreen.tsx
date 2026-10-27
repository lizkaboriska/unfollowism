import { useMemo, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Alert, Box, Button, HStack, IconButton, List, Stack, Text } from "@chakra-ui/react";
import { IMPORT_WARNINGS, analyzeImport, type ImportSelection } from "../io/analyzeImport.ts";
import type { LastSavedStore } from "../io/lastSaved.ts";
import { readInputs, type InputText } from "../io/readInputs.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { selectIsDirty } from "../store/selectors.ts";
import { IMPORT_STATUSES } from "../store/statuses.ts";
import { importPrepared } from "../store/thunks.ts";
import { useAlert, useConfirm } from "./dialogs.tsx";
import { missingText, noMasterConfirmText, olderMasterText, recognizedText } from "./importText.ts";

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : "Unexpected error";
}

const HELP = (
  <Stack gap="3">
    <Text>To get your export from Instagram:</Text>
    <List.Root as="ol" ps="5">
      <List.Item>Open Accounts Center → Your information and permissions → Download your information.</List.Item>
      <List.Item>Choose your Instagram account and only <b>Followers and following</b>.</List.Item>
      <List.Item>Pick the <b>JSON</b> format (not HTML), then request the download.</List.Item>
      <List.Item>When Instagram emails you, download the .zip.</List.Item>
    </List.Root>
    <Text>
      Then add that .zip (or the following.json and followers_*.json files from it) and the master file you saved
      last time, if you have one. They can be in different folders: add them one after another. Nothing leaves your browser.
    </Text>
  </Stack>
);

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
export function ImportScreen({ lastSaved, onImported, onCancel }: {
  /** When a master was last saved from this browser, for the older-master warnings. */
  lastSaved: LastSavedStore;
  onImported: () => void;
  /** Shown as a Cancel button when there is already something loaded to go back to. */
  onCancel?: () => void;
}) {
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  const alert = useAlert();
  const dirty = useAppSelector(selectIsDirty);
  const importing = useAppSelector(s => s.master.importStatus === IMPORT_STATUSES.IMPORTING);

  const fileInput = useRef<HTMLInputElement>(null);
  const [chosen, setChosen] = useState<readonly ChosenFile[]>([]);
  const [reading, setReading] = useState(0);
  const [importError, setImportError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  // Recomputed from all chosen files after every change. A conflict (e.g. two masters) keeps the list so a file can be removed.
  const { selection, selectionError } = useMemo((): { selection: ImportSelection | null; selectionError: string | null } => {
    if (!chosen.length) return { selection: null, selectionError: null };
    try {
      return { selection: analyzeImport(chosen.flatMap(c => c.inputs), lastSaved.get()), selectionError: null };
    } catch (e) {
      return { selection: null, selectionError: errorMessage(e) };
    }
  }, [chosen, lastSaved]);

  async function choose(files: File[]) {
    if (!files.length) return;
    setImportError(null);
    setReading(n => n + 1);
    try {
      const read = await Promise.all(files.map(readChosen));
      setChosen(current => {
        const next = [...current];
        for (const file of read) if (!next.some(c => c.id === file.id)) next.push(file);
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
    event.target.value = ""; // allow choosing the same files again
    void choose(files);
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void choose([...event.dataTransfer.files]);
  }

  async function onImport() {
    const prepared = selection?.prepared;
    if (!prepared) return;
    const noMaster = prepared.warnings.find(w => w.kind === IMPORT_WARNINGS.NO_MASTER_BUT_SAVED_BEFORE);
    if (noMaster) {
      const proceed = await confirm({
        title: "Import without your master?",
        body: noMasterConfirmText(noMaster.lastKnownSavedAt),
        confirmLabel: "Import anyway",
        destructive: true,
      });
      if (!proceed) return;
    }
    if (dirty) {
      const discard = await confirm({
        title: "Discard unsaved changes?",
        body: "Your changes since the last save aren't in a downloaded master yet. Importing replaces them. To keep them, cancel and Save master first.",
        confirmLabel: "Import anyway",
        destructive: true,
      });
      if (!discard) return;
    }
    setImportError(null);
    try {
      await dispatch(importPrepared(prepared)).unwrap();
      onImported();
    } catch (e) {
      setImportError(errorMessage(e));
    }
  }

  const missing = selection && missingText(selection.recognized);

  return (
    <Stack gap="4">
      <Box
        borderWidth="2px"
        borderStyle="dashed"
        borderColor={dragging ? "pink.500" : "border"}
        bg={dragging ? "pink.50" : "transparent"}
        borderRadius="lg"
        px="4"
        py="10"
        textAlign="center"
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => { setDragging(false); }}
        onDrop={onDrop}
      >
        <Stack gap="3" align="center">
          <Text fontWeight="medium">Drop your Instagram export here</Text>
          <Text fontSize="sm" color="fg.muted">The .zip (or its following.json + followers_*.json), plus your saved master if you have one</Text>
          <HStack>
            <input ref={fileInput} type="file" multiple accept=".zip,.json,.html" hidden onChange={onInput} data-testid="file-input" />
            <Button variant="outline" loading={reading > 0} onClick={() => fileInput.current?.click()}>Choose files</Button>
            <IconButton variant="ghost" aria-label="How to get your Instagram export" onClick={() => void alert({ title: "Getting your Instagram export", body: HELP })}>
              ?
            </IconButton>
          </HStack>
        </Stack>
      </Box>

      {chosen.length > 0 && (
        <Stack gap="1">
          {chosen.map(c => (
            <HStack key={c.id} gap="2">
              <IconButton size="xs" variant="ghost" aria-label={`Remove ${c.name}`} onClick={() => { remove(c.id); }}>×</IconButton>
              <Text truncate>{c.name}</Text>
              {c.readError && <Text color="red.600" fontSize="sm">{c.readError}</Text>}
            </HStack>
          ))}
          <Box>
            <Button size="xs" variant="ghost" onClick={() => { setChosen([]); setImportError(null); }}>Clear all</Button>
          </Box>
        </Stack>
      )}

      {selection && <Text>{recognizedText(selection.recognized, lastSaved.get())}</Text>}
      {missing && <Text color="fg.muted">{missing}</Text>}

      {selection?.prepared?.warnings.map(w => w.kind === IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE && (
        <Alert.Root key={w.kind} status="warning">
          <Alert.Indicator />
          <Alert.Title>{olderMasterText(w)}</Alert.Title>
        </Alert.Root>
      ))}

      {[selectionError, importError].map(message => message && (
        <Alert.Root key={message} status="error">
          <Alert.Indicator />
          <Alert.Title>{message}</Alert.Title>
        </Alert.Root>
      ))}

      <HStack>
        <Button colorPalette="pink" disabled={!selection?.prepared || reading > 0} loading={importing} onClick={() => void onImport()}>
          Import
        </Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </HStack>
    </Stack>
  );
}
