import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { Alert, Box, Button, HStack, IconButton, List, Stack, Text } from "@chakra-ui/react";
import { analyzeImport, type ImportSelection } from "../io/analyzeImport.ts";
import { readInputs } from "../io/readInputs.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { selectIsDirty } from "../store/selectors.ts";
import { IMPORT_STATUSES } from "../store/statuses.ts";
import { importPrepared } from "../store/thunks.ts";
import { useAlert, useConfirm } from "./dialogs.tsx";
import { missingText, recognizedText, warningText } from "./importText.ts";

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
      Then choose that .zip (or the following.json and followers_*.json files from it) <b>together with</b> the master
      file you saved last time, if you have one. Nothing leaves your browser.
    </Text>
  </Stack>
);

/**
 * Choose or drop the export (+ saved master), see what was recognized, then Import.
 * Each new selection replaces the previous one.
 */
export function ImportScreen({ lastSavedAt, onImported, onCancel }: {
  /** When a master was last saved from this browser, for the older-master warnings. */
  lastSavedAt: () => string | null;
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
  const [selection, setSelection] = useState<ImportSelection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  async function choose(files: File[]) {
    if (!files.length) return;
    setSelection(null);
    setError(null);
    try {
      setSelection(analyzeImport(await readInputs(files), lastSavedAt()));
    } catch (e) {
      setError(errorMessage(e));
    }
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
    if (dirty) {
      const discard = await confirm({
        title: "Discard unsaved changes?",
        body: "Your changes since the last save aren't in a downloaded master yet. Importing replaces them. To keep them, cancel and Save master first.",
        confirmLabel: "Import anyway",
        destructive: true,
      });
      if (!discard) return;
    }
    setError(null);
    try {
      await dispatch(importPrepared(prepared)).unwrap();
      onImported();
    } catch (e) {
      setError(errorMessage(e));
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
            <Button variant="outline" onClick={() => fileInput.current?.click()}>Choose files</Button>
            <IconButton variant="ghost" aria-label="How to get your Instagram export" onClick={() => void alert({ title: "Getting your Instagram export", body: HELP })}>
              ?
            </IconButton>
          </HStack>
        </Stack>
      </Box>

      {selection && <Text>{recognizedText(selection.recognized)}</Text>}
      {missing && <Text color="fg.muted">{missing}</Text>}

      {selection?.prepared?.warnings.map(w => (
        <Alert.Root key={w.kind} status="warning">
          <Alert.Indicator />
          <Alert.Title>{warningText(w)}</Alert.Title>
        </Alert.Root>
      ))}

      {error && (
        <Alert.Root status="error">
          <Alert.Indicator />
          <Alert.Title>{error}</Alert.Title>
        </Alert.Root>
      )}

      <HStack>
        <Button colorPalette="pink" disabled={!selection?.prepared} loading={importing} onClick={() => void onImport()}>
          Import
        </Button>
        {onCancel && <Button variant="ghost" onClick={onCancel}>Cancel</Button>}
      </HStack>
    </Stack>
  );
}
