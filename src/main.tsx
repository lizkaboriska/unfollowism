import { ChakraProvider } from '@chakra-ui/react';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Provider } from 'react-redux';

import { DialogProvider } from '@/shared/ui/dialogs.tsx';
import { browserAddressBar } from '@/shared/url/addressBar.ts';

import { App } from './App.tsx';
import { downloadText } from './io/download.ts';
import { localStorageLastSaved } from './io/lastSaved.ts';
import { browserTabEnvironment, claimTab } from './io/tabIdentity.ts';
import { createMemoryTabDatabase, openIndexedDbTabDatabase, type TabStore } from './io/tabStore.ts';
import { guardUnload } from './io/unloadGuard.ts';
import type { StoreDeps } from './store/deps.ts';
import { makeStore } from './store/index.ts';
import { selectIsDirty } from './store/selectors.ts';
import { system } from './theme.ts';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element');
}

/** This tab's reload safety net; falls back to memory (no reload survival) if browser storage is unavailable. */
async function openTabStore(): Promise<TabStore> {
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
  download: downloadText,
  tab: await openTabStore(),
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
          <App deps={deps} />
        </DialogProvider>
      </Provider>
    </ChakraProvider>
  </StrictMode>,
);
