const pad = (n: number) => String(n).padStart(2, '0');

/** unfollowism_progress_2026-10-27_14-05-09.json, in the user's local time. */
export function masterFileName(date: Date): string {
  const d = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const t = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `unfollowism_progress_${d}_${t}.json`;
}
