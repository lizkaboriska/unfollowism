/** The page's address: where the app reads which page and filters to show, and writes them back. */
export interface AddressBar {
  /** The current path and search, e.g. "/todo/remove" and "" or "/" and "?list=followers". */
  read(): { pathname: string; search: string };
  /** Shows `url` (a path with an optional search) as a new Back step. */
  push(url: string): void;
  /** Shows `url` in place of the current step. */
  replace(url: string): void;
  /** Calls `listener` after Back or Forward showed another step. Returns the unsubscribe. */
  onBackOrForward(listener: () => void): () => void;
}

export function browserAddressBar(): AddressBar {
  return {
    read: () => ({ pathname: window.location.pathname, search: window.location.search }),
    push: url => {
      window.history.pushState(null, '', url);
    },
    replace: url => {
      window.history.replaceState(window.history.state, '', url);
    },
    onBackOrForward: listener => {
      window.addEventListener('popstate', listener);
      return () => {
        window.removeEventListener('popstate', listener);
      };
    },
  };
}

/** For tests: an address and its Back steps kept in memory. `url` is the current one. */
export function memoryAddressBar(start = '/') {
  const steps = [new URL(start, 'https://memory.invalid')];
  let at = 0;
  const listeners = new Set<() => void>();
  const current = () => steps[at] ?? new URL('/', 'https://memory.invalid');
  const go = (by: number) => {
    if (steps[at + by]) {
      at += by;
      listeners.forEach(listener => {
        listener();
      });
    }
  };
  return {
    read: () => ({ pathname: current().pathname, search: current().search }),
    push: (url: string) => {
      steps.splice(at + 1, Infinity, new URL(url, current()));
      at += 1;
    },
    replace: (url: string) => {
      steps[at] = new URL(url, current());
    },
    onBackOrForward: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    back: () => {
      go(-1);
    },
    forward: () => {
      go(1);
    },
    get url() {
      return current().pathname + current().search;
    },
    /** Every step, oldest first. */
    get steps() {
      return steps.map(step => step.pathname + step.search);
    },
  } satisfies AddressBar & Record<string, unknown>;
}
