import { useEffect, useState } from "react";
import { Badge, Box, Checkbox, HStack, Stack, Text } from "@chakra-ui/react";
import { RELATIONSHIPS, relationshipOf, type Relationship } from "./core/index.ts";
import type { StoreDeps } from "./store/deps.ts";
import { useAppDispatch, useAppSelector } from "./store/hooks.ts";
import { setReviewed } from "./store/masterSlice.ts";
import { selectAccount, selectHasProject, selectVisibleAccountKeys } from "./store/selectors.ts";
import { restoreTab } from "./store/thunks.ts";
import { Header } from "./ui/Header.tsx";
import { ImportScreen } from "./ui/ImportScreen.tsx";
import { RelationshipCounts } from "./ui/RelationshipCounts.tsx";
import { StatusLine } from "./ui/StatusLine.tsx";
import { StorageWarning } from "./ui/StorageWarning.tsx";

// The account list is still the MVP version (replaced in phase 4c).

const LIST_LIMIT = 100;

const RELATIONSHIP_LABELS: Record<Relationship, string> = {
  [RELATIONSHIPS.MUTUAL]: "Mutual",
  [RELATIONSHIPS.NOT_FOLLOWING_BACK]: "Not following back",
  [RELATIONSHIPS.FOLLOWS_YOU_ONLY]: "Follows you only",
  [RELATIONSHIPS.NEITHER]: "Neither",
};

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
  const keys = useAppSelector(selectVisibleAccountKeys);
  const [importOpen, setImportOpen] = useState(false);

  // After a reload, silently continue where this tab left off.
  useEffect(() => {
    void dispatch(restoreTab());
  }, [dispatch]);

  const showImport = !hasProject || importOpen;

  return (
    <Box maxW="4xl" mx="auto" px="4" py="8">
      <Stack gap="5">
        <Header {...(showImport ? {} : { onImportNew: () => { setImportOpen(true); } })} />

        {showImport ? (
          <ImportScreen
            lastSaved={deps.lastSaved}
            onImported={() => { setImportOpen(false); }}
            {...(hasProject ? { onCancel: () => { setImportOpen(false); } } : {})}
          />
        ) : (
          <>
            <StorageWarning durable={deps.tab.durable} />
            <StatusLine />
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
