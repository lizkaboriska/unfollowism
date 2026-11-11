const pad = (number: number) => String(number).padStart(2, '0');

/** unfollowism_progress_2026-10-27_14-05-09.json, in the user's local time. */
export function masterFileName(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `unfollowism_progress_${day}_${time}.json`;
}
