import { useEffect, useState } from "react";
import { Box, Stack, Text } from "@chakra-ui/react";
import type { StoreDeps } from "./store/deps.ts";
import { useAppDispatch, useAppSelector } from "./store/hooks.ts";
import { selectHasProject } from "./store/selectors.ts";
import { restoreTab } from "./store/thunks.ts";
import { AccountList } from "./ui/AccountList.tsx";
import { FiltersBar } from "./ui/FiltersBar.tsx";
import { Header } from "./ui/Header.tsx";
import { ImportScreen } from "./ui/ImportScreen.tsx";
import { RelationshipCounts } from "./ui/RelationshipCounts.tsx";
import { StatusLine } from "./ui/StatusLine.tsx";
import { StorageWarning } from "./ui/StorageWarning.tsx";
import { SummaryLine } from "./ui/SummaryLine.tsx";
import { ViewTabs } from "./ui/ViewTabs.tsx";

export function App({ deps }: { deps: StoreDeps }) {
  const dispatch = useAppDispatch();
  const hasProject = useAppSelector(selectHasProject);
  const [importOpen, setImportOpen] = useState(false);
  const [restoring, setRestoring] = useState(true);

  // After a reload, silently continue where this tab left off.
  useEffect(() => {
    void dispatch(restoreTab()).finally(() => { setRestoring(false); });
  }, [dispatch]);

  if (restoring && !hasProject) {
    return (
      <Box maxW="5xl" mx="auto" px="4" py="8">
        <Text color="fg.muted">Loading your work…</Text>
      </Box>
    );
  }

  const showImport = !hasProject || importOpen;

  return (
    <Box maxW="5xl" mx="auto" px="4" py="8">
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
            <ViewTabs />
            <FiltersBar />
            <SummaryLine />
            <AccountList />
          </>
        )}
      </Stack>
    </Box>
  );
}
