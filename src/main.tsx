import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import { Provider } from "react-redux";
import { App } from "./App.tsx";
import { downloadText } from "./io/download.ts";
import { createIndexedDbSessionStore, createMemorySessionStore } from "./io/sessionStore.ts";
import type { StoreDeps } from "./store/deps.ts";
import { makeStore } from "./store/index.ts";
import { system } from "./theme.ts";

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

const deps: StoreDeps = {
  now: () => new Date(),
  download: downloadText,
  // Some private-browsing modes have no IndexedDB; the app still works, just without resume.
  sessionStore: typeof indexedDB === "undefined" ? createMemorySessionStore() : createIndexedDbSessionStore(),
};
const store = makeStore(deps);

createRoot(rootElement).render(
  <StrictMode>
    <ChakraProvider value={system}>
      <Provider store={store}>
        <App deps={deps} />
      </Provider>
    </ChakraProvider>
  </StrictMode>,
);
