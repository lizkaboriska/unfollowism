/**
 * Asks the browser to keep this site's storage instead of deleting it on its own (low disk space, Safari's 7 days
 * without a visit). There is no prompt: the browser decides by itself, and a no changes nothing. Resolves the answer
 * (check it in the console with `await navigator.storage.persisted()`).
 */
export async function persistStorage(
  storage: Pick<StorageManager, 'persist'> | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.storage,
): Promise<boolean> {
  if (typeof storage?.persist !== 'function') {
    return false;
  }
  try {
    return await storage.persist();
  } catch (error) {
    console.error('Asking the browser to keep storage failed:', error);
    return false;
  }
}
