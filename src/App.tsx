import { useEffect, useRef, useState, type ChangeEvent } from "react";
import { Alert, Badge, Box, Button, Checkbox, HStack, Heading, Stack, Text } from "@chakra-ui/react";
import { analyzeImport, type ImportWarning, type PreparedImport } from "./io/analyzeImport.ts";
import { readInputs } from "./io/readInputs.ts";
import type { StoreDeps } from "./store/deps.ts";
import { useAppDispatch, useAppSelector } from "./store/hooks.ts";
import { restoreSession, setReviewed } from "./store/masterSlice.ts";
import { selectAccount, selectHasProject, selectIsDirty, selectRelationshipStats, selectVisibleAccountKeys } from "./store/selectors.ts";
import { importPrepared, loadStoredSession, saveMaster, type RestoredSession } from "./store/thunks.ts";

// MVP shell: proves import → review → save works end to end. The real UI comes next.

const LIST_LIMIT = 100;

function errorMessage(error: unknown): string {
  return typeof error === "string" ? error : error instanceof Error ? error.message : "Unexpected error";
}

function describeWarning(warning: ImportWarning): string {
  const when = new Date(warning.lastKnownSavedAt).toLocaleString();
  return warning.kind === "no_master_but_saved_before"
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
        <Badge>{account.current.relationship.replaceAll("_", " ")}</Badge>
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
  const dirty = useAppSelector(selectIsDirty);
  const message = useAppSelector(s => s.master.message);
  const importing = useAppSelector(s => s.master.importStatus === "importing");
  const stats = useAppSelector(selectRelationshipStats);
  const keys = useAppSelector(selectVisibleAccountKeys);

  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [awaitingConfirm, setAwaitingConfirm] = useState<PreparedImport | null>(null);
  const [stored, setStored] = useState<RestoredSession | null>(null);

  useEffect(() => {
    void dispatch(loadStoredSession()).unwrap().then(setStored);
  }, [dispatch]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => { window.removeEventListener("beforeunload", warn); };
  }, [dirty]);

  async function apply(prepared: PreparedImport) {
    setAwaitingConfirm(null);
    setStored(null);
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
      const prepared = analyzeImport(await readInputs(files), await deps.sessionStore.getLastSavedAt().catch(() => null));
      if (prepared.warnings.length) setAwaitingConfirm(prepared);
      else await apply(prepared);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <Box maxW="4xl" mx="auto" px="4" py="8">
      <Stack gap="5">
        <Box>
          <Heading size="2xl">Instagram Review</Heading>
          <Text color="fg.muted">Keep your feed fun. Keep your people intentional.</Text>
        </Box>

        <HStack gap="3" wrap="wrap">
          <input ref={fileInput} type="file" multiple accept=".zip,.json,.html" hidden onChange={e => void onFiles(e)} data-testid="file-input" />
          <Button colorPalette="pink" loading={importing} onClick={() => fileInput.current?.click()}>
            Import files
          </Button>
          <Button variant="outline" disabled={!hasProject || !dirty} onClick={() => void dispatch(saveMaster())}>
            Save master
          </Button>
          {hasProject && <Text color={dirty ? "yellow.700" : "green.700"}>{dirty ? "Unsaved changes" : "Saved"}</Text>}
        </HStack>

        <Text fontSize="sm" color="fg.muted">
          Choose your Instagram export (.zip, or following.json + followers_*.json) and, if you have one, your saved master .json — all at once.
          Nothing leaves your browser.
        </Text>

        {stored && !hasProject && (
          <Alert.Root status="info">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>Unfinished session from {new Date(stored.storedAt).toLocaleString()}</Alert.Title>
              <Alert.Description>
                <HStack mt="2">
                  <Button size="sm" onClick={() => { dispatch(restoreSession(stored)); setStored(null); }}>Resume</Button>
                  <Button size="sm" variant="ghost" onClick={() => { setStored(null); }}>Dismiss</Button>
                </HStack>
              </Alert.Description>
            </Alert.Content>
          </Alert.Root>
        )}

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

        {error && (
          <Alert.Root status="error">
            <Alert.Indicator />
            <Alert.Title>{error}</Alert.Title>
          </Alert.Root>
        )}

        {message && <Text>{message}</Text>}

        {hasProject && (
          <>
            <HStack gap="2" wrap="wrap">
              <Badge colorPalette="purple">Following {stats.following}</Badge>
              <Badge colorPalette="blue">Followers {stats.followers}</Badge>
              <Badge colorPalette="green">Mutual {stats.mutual}</Badge>
              <Badge colorPalette="red">Not back {stats.notFollowingBack}</Badge>
              <Badge colorPalette="blue">Followers only {stats.followsYouOnly}</Badge>
            </HStack>
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
