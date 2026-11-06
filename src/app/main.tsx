import { ChakraProvider } from '@chakra-ui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import type { StoreDeps } from '@/app/store/deps.ts';
import { makeStore, type AppStore } from '@/app/store/store.ts';
import { activeTab, browserTabChannel, browserTabLocks } from '@/app/tab/activeTab.ts';
import { handleTakenOver } from '@/app/tab/takenOver.ts';
import { guardUnload } from '@/app/tab/unloadGuard.ts';
import {
  localStorageLastSaved,
  selectIsDirty,
  createMemoryBackupStore,
  openIndexedDbBackupStore,
  type BackupStore,
} from '@/entities/master';
import { localStorageHowItWorksSeen } from '@/pages/import';
import { OtherTabScreen } from '@/pages/other-tab';
import { TabStoppedScreen } from '@/pages/tab-stopped';
import { downloadText } from '@/shared/lib/download.ts';
import { nextPaint } from '@/shared/lib/nextPaint.ts';
import { persistStorage } from '@/shared/lib/persistStorage.ts';
import { DialogProvider } from '@/shared/ui/DialogProvider.tsx';
import { system } from '@/shared/ui/theme.ts';
import { Toaster } from '@/shared/ui/Toaster.tsx';
import { browserAddressBar } from '@/shared/url/addressBar.ts';

import { App } from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

/** The browser backup; falls back to memory (no reload survival) if browser storage is unavailable. */
async function openBackupStore(): Promise<BackupStore> {
  try {
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB unavailable');
    }
    return await openIndexedDbBackupStore();
  } catch (error) {
    console.error('Browser storage unavailable, keeping work in memory only:', error);
    return createMemoryBackupStore();
  }
}

const root = createRoot(rootElement);
let stopGuard: (() => void) | null = null;
let started: { store: AppStore; durable: boolean } | null = null;

async function startApp(): Promise<void> {
  void persistStorage();
  const deps: StoreDeps = {
    now: () => new Date(),
    nextPaint,
    download: downloadText,
    backup: await openBackupStore(),
    lastSaved: localStorageLastSaved(),
    address: browserAddressBar(),
  };
  const store = makeStore(deps);
  started = { store, durable: deps.backup.durable };
  stopGuard = guardUnload(store, () => selectIsDirty(store.getState()));
  root.render(
    <StrictMode>
      <ChakraProvider value={system}>
        <Provider store={store}>
          <DialogProvider>
            <App deps={deps} howItWorksSeen={localStorageHowItWorksSeen()} />
          </DialogProvider>
        </Provider>
      </ChakraProvider>
    </StrictMode>,
  );
}

// Another tab took over: reload to Open in another tab, or This tab stopped if the work here isn't stored.
const tab = activeTab(browserTabLocks(), browserTabChannel(), () => {
  handleTakenOver(started?.store ?? null, started?.durable ?? false, {
    stopGuard: () => stopGuard?.(),
    reload: () => {
      window.location.reload();
    },
    showStopped: store => {
      root.render(
        <StrictMode>
          <ChakraProvider value={system}>
            <Provider store={store}>
              <TabStoppedScreen />
              <Toaster />
            </Provider>
          </ChakraProvider>
        </StrictMode>,
      );
    },
  });
});
if (await tab.claim()) {
  await startApp();
} else {
  root.render(
    <StrictMode>
      <ChakraProvider value={system}>
        <OtherTabScreen
          onUseHere={async () => {
            await tab.takeOver();
            await startApp();
          }}
        />
      </ChakraProvider>
    </StrictMode>,
  );
}
