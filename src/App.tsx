import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert, Badge, Box, Button, Checkbox, HStack, Stack, Text } from "@chakra-ui/react";
import { RELATIONSHIPS, relationshipOf, type Relationship } from "./core/index.ts";
import { IMPORT_WARNINGS, analyzeImport, type ImportWarning, type PreparedImport } from "./io/analyzeImport.ts";
import { readInputs } from "./io/readInputs.ts";
import type { StoreDeps } from "./store/deps.ts";
import { IMPORT_STATUSES } from "./store/statuses.ts";
import { useAppDispatch, useAppSelector } from "./store/hooks.ts";
import { setReviewed } from "./store/masterSlice.ts";
import { selectAccount, selectHasProject, selectVisibleAccountKeys } from "./store/selectors.ts";
import { importPrepared, restoreTab } from "./store/thunks.ts";
import { Header } from "./ui/Header.tsx";
import { RelationshipCounts } from "./ui/RelationshipCounts.tsx";
import { StatusLine } from "./ui/StatusLine.tsx";
import { StorageWarning } from "./ui/StorageWarning.tsx";

// The import controls and the account list are still the MVP versions (replaced in phases 4b and 4c).

const LIST_LIMIT = 100;

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  [RELATIONSHIPS.MUTUAL]: "Mutual",
  [RELATIONSHIPS.NOT_FOLLOWING_BACK]: "Not following back",
  [RELATIONSHIPS.FOLLOWS_YOU_ONLY]: "Follows you only",
  [RELATIONSHIPS.NEITHER]: "Neither",
};

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : "Unexpected error";
}

function describeWarning(warning: ImportWarning): string {
  const when = new Date(warning.lastKnownSavedAt).toLocaleString();
  return warning.kind === IMPORT_WARNINGS.NO_MASTER_BUT_SAVED_BEFORE
    ? `You saved a master from this browser on ${when}, but didn't choose one. Importing without it starts your review history from scratch.`
    : `The chosen master is older than the one you saved from this browser on ${when}. Recent review work may be missing from it.`;
}

function AccountRow({ accountKey }: { accountKey: string }) {
  const dispatch = useAppDispatch();
  const account = useAppSelector(s => selectAccount(s, accountKey));
  if (!account) return null;
  return (
    <HStack justify="space-between" borderBottomWidth="1px" py="2">
      <HStack gap="3">
        <Text fontWeight="medium">@{account.username}</Text>
        <Badge>{RELATIONSHIP_LABELS[relationshipOf(account)]}</Badge>
      </HStack>
      <Checkbox.Root
        checked={account.review.reviewed}
        onCheckedChange={e => dispatch(setReviewed({ username: account.username, reviewed: e.checked === true }))}
      >
        <Checkbox.HiddenInput />
        <Checkbox.Control />
        <Checkbox.Label>Reviewed</Checkbox.Label>
      </Checkbox.Root>
    </HStack>
  );
}

export function App({ deps }: { deps: StoreDeps }) {
  const dispatch = useAppDispatch();
  const hasProject = useAppSelector(selectHasProject);
  const importing = useAppSelector(s => s.master.importStatus === IMPORT_STATUSES.IMPORTING);
  const keys = useAppSelector(selectVisibleAccountKeys);

  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState<PreparedImport | null>(null);

  // After a reload, silently continue where this tab left off.
  useEffect(() => {
    void dispatch(restoreTab());
  }, [dispatch]);

  async function apply(prepared: PreparedImport) {
    setAwaitingConfirm(null);
    try {
      await dispatch(importPrepared(prepared)).unwrap();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = [...(event.target.files ?? [])];
    event.target.value = ""; // allow choosing the same files again
    if (!files.length) return;
    setError(null);
    try {
      const prepared = analyzeImport(await readInputs(files), deps.lastSaved.get());
      if (prepared.warnings.length) setAwaitingConfirm(prepared);
      else await apply(prepared);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Box maxW="4xl" mx="auto" px="4" py="8">
      <Stack gap="5">
        <Header />

        <HStack gap="3" wrap="wrap">
          <input ref={fileInput} type="file" multiple accept=".zip,.json,.html" hidden onChange={e => void onFiles(e)} data-testid="file-input" />
          <Button colorPalette="pink" loading={importing} onClick={() => fileInput.current?.click()}>
            Import files
          </Button>
        </HStack>

        <Text fontSize="sm" color="fg.muted">
          Choose your Instagram export (.zip, or following.json + followers_*.json) and, if you have one, your saved master .json — all at once.
          Nothing leaves your browser.
        </Text>

        {awaitingConfirm && (
          <Alert.Root status="warning">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Check before importing</Alert.Title>
              <Alert.Description>
                {awaitingConfirm.warnings.map(w => <Text key={w.kind}>{describeWarning(w)}</Text>)}
                <HStack mt="2">
                  <Button size="sm" colorPalette="yellow" onClick={() => void apply(awaitingConfirm)}>Import anyway</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setAwaitingConfirm(null); }}>Cancel</Button>
                </HStack>
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

        <StorageWarning durable={deps.tab.durable} />
        <StatusLine error={error} />

        {hasProject && (
          <>
            <RelationshipCounts />
            <Box>
              <Text fontSize="sm" color="fg.muted" mb="2">
                I follow · showing {Math.min(keys.length, LIST_LIMIT)} of {keys.length}
              </Text>
              {keys.slice(0, LIST_LIMIT).map(key => <AccountRow key={key} accountKey={key} />)}
            </Box>
          </>
        )}
      </Stack>
    </Box>
  );
}
