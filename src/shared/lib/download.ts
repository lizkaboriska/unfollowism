import { isIosHomeScreenApp } from './ios.ts';

export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke later: some browsers start the download asynchronously.
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

/**
 * Saves a text file. It downloads, except in an iPhone/iPad Home Screen app, which has no downloads: there it opens
 * the share sheet ("Save to Files"). Rejects with the share sheet's AbortError when it was closed without saving;
 * the browser doesn't say whether a download was kept.
 */
export async function saveTextFile(filename: string, text: string, type = 'application/json'): Promise<void> {
  const file = new File([text], filename, { type });
  if (isIosHomeScreenApp() && 'canShare' in navigator && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return;
    } catch (error) {
      // Not allowed (e.g. too long after the tap): download instead. Anything else, like closing it, goes up.
      if (!(error instanceof DOMException && error.name === 'NotAllowedError')) {
        throw error;
      }
    }
  }
  downloadText(filename, text, type);
}
