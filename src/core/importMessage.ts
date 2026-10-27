import type { ImportResult } from "./merge.ts";

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function changeSummary(result: ImportResult): string {
  const c = result.changes;
  return `+${c.newly_following.length} following, -${c.stopped_following.length} following, ` +
    `+${c.new_followers.length} followers, -${c.lost_followers.length} followers.`;
}

/** Status-bar text after an import. */
export function buildImportMessage(result: ImportResult): string {
  const files = plural(result.followerFileCount, "follower file");
  const confirmation = result.confirmed.total
    ? ` Confirmed ${plural(result.confirmed.unfollow, "unfollow")} and ${plural(result.confirmed.remove_follower, "follower removal")}.`
    : "";

  if (result.isNewMaster) {
    return `Started a new master from ${files}. ${result.followingCount} following, ${result.followersCount} followers. Save master to keep it.`;
  }
  if (result.snapshotCreated) {
    return `New snapshot detected — not saved. Loaded ${files}. ${result.followingCount} following, ${result.followersCount} followers. ` +
      `Changes: ${changeSummary(result)}${confirmation}`;
  }
  if (result.confirmed.total) {
    return `Loaded ${files}. The export matches the latest snapshot.${confirmation} Save master to keep the updated action history.`;
  }
  return `Loaded ${files}; up to date. Latest saved changes: ${changeSummary(result)}`;
}
