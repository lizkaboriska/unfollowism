import type { ImportResult } from "./merge.ts";

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Status-bar text after an import. */
export function buildImportMessage(result: ImportResult): string {
  const files = plural(result.followerFileCount, "follower file");
  const counts = `${result.followingCount} following, ${result.followersCount} followers.`;
  const followerChanges = `${plural(result.changes.new_followers.length, "new follower")}, ${plural(result.changes.lost_followers.length, "lost follower")}.`;
  const confirmation = result.confirmed.total
    ? ` Confirmed ${plural(result.confirmed.unfollow, "unfollow")} and ${plural(result.confirmed.remove_follower, "follower removal")}.`
    : "";

  if (result.isNewMaster) return `Started a new master from ${files}. ${counts} Save master to keep it.`;
  if (result.exportChanged) return `New export loaded from ${files} — not saved yet. ${counts} Since the last import: ${followerChanges}${confirmation}`;
  return `Loaded ${files}: same as the last import. ${counts} From that import: ${followerChanges}${confirmation}`;
}
