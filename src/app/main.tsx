import { ChakraProvider } from '@chakra-ui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import type { StoreDeps } from '@/app/store/deps.ts';
import { makeStore } from '@/app/store/store.ts';
import { browserTabEnvironment, claimTab } from '@/app/tab/tabIdentity.ts';
import { guardUnload } from '@/app/tab/unloadGuard.ts';
import { localStorageLastSaved, selectIsDirty } from '@/entities/master';
import { createMemoryTabDatabase, openIndexedDbTabDatabase, type BackupStore } from '@/entities/master';
import { localStorageHowItWorksSeen } from '@/pages/import';
import { downloadText } from '@/shared/lib/download.ts';
import { nextPaint } from '@/shared/lib/nextPaint.ts';
import { DialogProvider } from '@/shared/ui/DialogProvider.tsx';
import { system } from '@/shared/ui/theme.ts';
import { browserAddressBar } from '@/shared/url/addressBar.ts';

import { App } from './App.tsx';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

/** This tab's reload safety net; falls back to memory (no reload survival) if browser storage is unavailable. */
async function openBackupStore(): Promise<BackupStore> {
  try {
    if (typeof indexedDB === 'undefined') {
      throw new Error('IndexedDB unavailable');
    }
    const database = openIndexedDbTabDatabase();
    return database.forTab(await claimTab(database, browserTabEnvironment()));
  } catch (error) {
    console.error('Browser storage unavailable, keeping work in memory only:', error);
    return createMemoryTabDatabase().forTab('memory');
  }
}

const deps: StoreDeps = {
  now: () => new Date(),
  nextPaint,
  download: downloadText,
  backup: await openBackupStore(),
  lastSaved: localStorageLastSaved(),
  address: browserAddressBar(),
};
const store = makeStore(deps);
guardUnload(store, () => selectIsDirty(store.getState()));

createRoot(rootElement).render(
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
