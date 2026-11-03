export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** Instagram follow dates are in seconds. */
export function formatSince(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' });
}
