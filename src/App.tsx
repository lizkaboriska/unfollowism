import { Box, HStack, Stack, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';

import type { StoreDeps } from './store/deps.ts';
import { LIST_VIEWS, isPlanView } from './store/filtersSlice.ts';
import { useAppDispatch, useAppSelector } from './store/hooks.ts';
import { selectHasProject } from './store/selectors.ts';
import { restoreTab } from './store/thunks.ts';
import { AppHeader } from './ui/AppHeader.tsx';
import { AppNav } from './ui/AppNav.tsx';
import { ChangesPage } from './ui/ChangesPage.tsx';
import { ImportHero } from './ui/ImportHero.tsx';
import { ImportScreen } from './ui/ImportScreen.tsx';
import { ReviewList } from './ui/ReviewList.tsx';
import { ReviewTop } from './ui/ReviewTop.tsx';
import { StatusLine } from './ui/StatusLine.tsx';
import { StorageWarning } from './ui/StorageWarning.tsx';
import { Toaster } from './ui/Toaster.tsx';
import { TodoPage } from './ui/TodoPage.tsx';

export function App({ deps }: { deps: StoreDeps }) {
  const dispatch = useAppDispatch();
  const hasProject = useAppSelector(selectHasProject);
  const view = useAppSelector(s => s.filters.view);
  const [importOpen, setImportOpen] = useState(false);
  const [restoring, setRestoring] = useState(true);

  // After a reload, silently continue where this tab left off.
  useEffect(() => {
    void dispatch(restoreTab()).finally(() => {
      setRestoring(false);
    });
  }, [dispatch]);

  // A file dropped anywhere but the import drop zone would be opened by the browser, leaving the app.
  useEffect(() => {
    const keepPage = (event: Event) => {
      event.preventDefault();
    };
    window.addEventListener('dragover', keepPage);
    window.addEventListener('drop', keepPage);
    return () => {
      window.removeEventListener('dragover', keepPage);
      window.removeEventListener('drop', keepPage);
    };
  }, []);

  if (restoring && !hasProject) {
    return (
      <Box maxW="5xl" mx="auto" p="5">
        <Text color="fg.muted">Loading your work…</Text>
      </Box>
    );
  }

  const showImport = !hasProject || importOpen;

  return (
    <Box minH="100dvh">
      <Toaster />
      {showImport ? (
        <ImportHero />
      ) : (
        <AppHeader
          onImportNew={() => {
            setImportOpen(true);
          }}
        />
      )}
      {showImport ? (
        <Box maxW="5xl" mx="auto" p="5">
          <ImportScreen
            lastSaved={deps.lastSaved}
            onImported={() => {
              setImportOpen(false);
            }}
            {...(hasProject
              ? {
                  onCancel: () => {
                    setImportOpen(false);
                  },
                }
              : {})}
          />
        </Box>
      ) : (
        // The bottom nav covers the end of the page on a phone, so the page leaves room for it.
        <HStack maxW="5xl" mx="auto" p="5" pb={{ base: '84px', md: '5' }} gap="5" align="flex-start">
          <AppNav />
          <Stack gap="4" flex="1" minW="0">
            <StorageWarning durable={deps.tab.durable} />
            <StatusLine />
            {view === LIST_VIEWS.REVIEW && (
              <>
                <ReviewTop />
                <ReviewList />
              </>
            )}
            {view === LIST_VIEWS.CHANGES && <ChangesPage />}
            {isPlanView(view) && <TodoPage view={view} />}
          </Stack>
        </HStack>
      )}
    </Box>
  );
}
