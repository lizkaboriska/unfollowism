import { Box, HStack, Heading, Stack, Text } from '@chakra-ui/react';
import { useEffect, useState } from 'react';

import type { StoreDeps } from '@/app/store/deps.ts';
import { addressChanged } from '@/app/url/urlSync.ts';
import { selectHasProject, restoreTab, LIST_VIEWS, isPlanView } from '@/entities/master';
import { ChangesPage } from '@/pages/changes';
import { ImportHero, ImportScreen } from '@/pages/import';
import { ReviewList } from '@/pages/review';
import { TodoPage } from '@/pages/todo';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks.ts';
import { Toaster } from '@/shared/ui/Toaster.tsx';
import { AppHeader } from '@/widgets/header';
import { AppNav } from '@/widgets/nav';
import { ReviewTop } from '@/widgets/review-top';
import { StatusLine, StorageWarning } from '@/widgets/status';

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

  // Back and Forward change the address without a reload: show the page it names.
  useEffect(
    () =>
      deps.address.onBackOrForward(() => {
        dispatch(addressChanged());
      }),
    [deps.address, dispatch],
  );

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
      <Stack minH="100dvh" align="center" justify="center" gap="1" p="5" role="status">
        <Heading textStyle="appName" lineHeight="1">
          Unfollowism
        </Heading>
        <Text textStyle="small" color="fg.muted">
          Loading your work…
        </Text>
      </Stack>
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
