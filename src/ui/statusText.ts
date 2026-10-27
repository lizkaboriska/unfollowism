import { ACTION_TYPES, type ImportSummary } from "../core/index.ts";
import { STATUS_EVENTS, type StatusEvent } from "../store/statuses.ts";

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function importText(isNewMaster: boolean, followerFileCount: number, summary: ImportSummary): string {
  const files = plural(followerFileCount, "follower file");
  const counts = `${summary.followingCount} following, ${summary.followersCount} followers.`;
  const followerChanges = `${plural(summary.newFollowers, "new follower")}, ${plural(summary.lostFollowers, "lost follower")}.`;
  const unfollows = summary.confirmed[ACTION_TYPES.UNFOLLOW];
  const removals = summary.confirmed[ACTION_TYPES.REMOVE_FOLLOWER];
  const confirmation = unfollows || removals ? ` Confirmed ${plural(unfollows, "unfollow")} and ${plural(removals, "follower removal")}.` : "";

  if (isNewMaster) return `Started a new master from ${files}. ${counts} Save master to keep it.`;
  if (summary.exportChanged) return `New export loaded from ${files} — not saved yet. ${counts} Since the last import: ${followerChanges}${confirmation}`;
  return `Loaded ${files}: same as the last import. ${counts} From that import: ${followerChanges}${confirmation}`;
}

/** Status-bar text for what last happened. */
export function statusText(status: StatusEvent | null): string {
  if (!status) return "";
  switch (status.type) {
    case STATUS_EVENTS.IMPORTED:
      return importText(status.isNewMaster, status.followerFileCount, status.summary);
    case STATUS_EVENTS.SAVED:
      return status.changedWhileSaving
        ? `Master saved as ${status.filename}. Changes made while saving are not in that file yet.`
        : `Master saved as ${status.filename}. Keep this file: import it next time.`;
    case STATUS_EVENTS.SAVE_FAILED:
      return `Could not save master: ${status.reason}`;
  }
}
