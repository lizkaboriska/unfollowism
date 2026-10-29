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

const pad = (n: number) => String(n).padStart(2, '0');

/** instagram_master_tracker_2026-10-27_14-05-09.json, in the user's local time. */
export function masterFileName(date: Date): string {
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `instagram_master_tracker_${d}_${t}.json`;
}
