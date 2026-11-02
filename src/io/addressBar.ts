/** The page's address: where the app reads which page and filters to show, and writes them back. */
export interface AddressBar {
  /** The current path and search, e.g. "/todo/remove" and "" or "/" and "?list=followers". */
  read(): { pathname: string; search: string };
  /** Shows `url` (a path with an optional search) without a reload or a new Back step. */
  replace(url: string): void;
}

export function browserAddressBar(): AddressBar {
  return {
    read: () => ({ pathname: window.location.pathname, search: window.location.search }),
    replace: url => {
      window.history.replaceState(window.history.state, '', url);
    },
  };
}

/** For tests: an address kept in memory. `url` is the current one. */
export function memoryAddressBar(start = '/'): AddressBar & { readonly url: string } {
  let current = new URL(start, 'https://memory.invalid');
  return {
    read: () => ({ pathname: current.pathname, search: current.search }),
    replace: url => {
      current = new URL(url, current);
    },
    get url() {
      return current.pathname + current.search;
    },
  };
}
