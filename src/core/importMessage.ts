import { totalOf } from "./actions.ts";
import type { ImportResult } from "./merge.ts";
import { ACTION_TYPES } from "./types.ts";

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

/** Status-bar text after an import. */
export function buildImportMessage(result: ImportResult): string {
  const { summary } = result;
  const files = plural(result.followerFileCount, "follower file");
  const counts = `${summary.followingCount} following, ${summary.followersCount} followers.`;
  const followerChanges = `${plural(summary.newFollowers, "new follower")}, ${plural(summary.lostFollowers, "lost follower")}.`;
  const confirmation = totalOf(summary.confirmed)
    ? ` Confirmed ${plural(summary.confirmed[ACTION_TYPES.UNFOLLOW], "unfollow")} and ${plural(summary.confirmed[ACTION_TYPES.REMOVE_FOLLOWER], "follower removal")}.`
    : "";

  if (result.isNewMaster) return `Started a new master from ${files}. ${counts} Save master to keep it.`;
  if (summary.exportChanged) return `New export loaded from ${files} — not saved yet. ${counts} Since the last import: ${followerChanges}${confirmation}`;
  return `Loaded ${files}: same as the last import. ${counts} From that import: ${followerChanges}${confirmation}`;
}
