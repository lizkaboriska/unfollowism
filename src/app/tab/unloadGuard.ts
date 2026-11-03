/**
 * Asks the browser to confirm closing or reloading the tab while there is unsaved work.
 * The listener is attached only while `isDirty()` is true: a page that always has a
 * beforeunload listener can't be kept in the back/forward cache by some browsers.
 * Returns a function that stops guarding.
 */
export function guardUnload(
  store: { subscribe: (listener: () => void) => () => void },
  isDirty: () => boolean,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
): () => void {
  const onBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
  };
  let guarded = false;
  const setGuarded = (next: boolean) => {
    if (next === guarded) {
      return;
    }
    guarded = next;
    if (next) {
      target.addEventListener('beforeunload', onBeforeUnload);
    } else {
      target.removeEventListener('beforeunload', onBeforeUnload);
    }
  };

  setGuarded(isDirty());
  const unsubscribe = store.subscribe(() => {
    setGuarded(isDirty());
  });
  return () => {
    unsubscribe();
    setGuarded(false);
  };
}
