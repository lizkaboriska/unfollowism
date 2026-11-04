import { ChakraProvider } from '@chakra-ui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import type { StoreDeps } from '@/app/store/deps.ts';
import { makeStore } from '@/app/store/store.ts';
import { activeTab, browserTabLocks } from '@/app/tab/activeTab.ts';
import { guardUnload } from '@/app/tab/unloadGuard.ts';
import { localStorageLastSaved, selectIsDirty } from '@/entities/master';
import { createMemoryBackupStore, openIndexedDbBackupStore, type BackupStore } from '@/entities/master';
import { localStorageHowItWorksSeen } from '@/pages/import';
import { OtherTabScreen } from '@/pages/other-tab';
import { downloadText } from '@/shared/lib/download.ts';
import { nextPaint } from '@/shared/lib/nextPaint.ts';
import { persistStorage } from '@/shared/lib/persistStorage.ts';
import { DialogProvider } from '@/shared/ui/DialogProvider.tsx';
import { system } from '@/shared/ui/theme.ts';
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

// Another tab took over: reload, which shows the Open in another tab page (no "Leave site?": the work is stored).
const tab = activeTab(browserTabLocks(), () => {
  stopGuard?.();
  window.location.reload();
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
