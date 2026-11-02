/** Marks a field that handles Escape itself: a sheet around it doesn't close on that Escape. */
export const OWN_ESCAPE = 'data-own-escape';

/** For a sheet's onEscapeKeyDown: leaves an Escape pressed in an OWN_ESCAPE field to that field. */
export function keepOpenOnOwnEscape(event: globalThis.KeyboardEvent): void {
  if (event.target instanceof Element && event.target.closest(`[${OWN_ESCAPE}]`)) {
    event.preventDefault();
  }
}
