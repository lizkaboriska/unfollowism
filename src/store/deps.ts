import type { SessionStore } from "../io/sessionStore.ts";

/** Side effects injected into thunks (thunk `extra`), so tests can replace them. */
export interface StoreDeps {
  now: () => Date;
  download: (filename: string, text: string) => void | Promise<void>;
  sessionStore: SessionStore;
}
