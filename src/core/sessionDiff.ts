import { createReview } from "./review.ts";
import type { Action, DeepReadonly, Master } from "./types.ts";
import { usernameKey } from "./util.ts";

export type SessionCategory = "reviews" | "tags" | "actions" | "other";

export type SessionChange =
  | { category: "reviews"; type: "reviewed" | "unreviewed"; label: string }
  | { category: "tags"; type: "tag_added" | "tag_removed"; label: string; tag: string }
  | { category: "actions"; type: "unfollow_pending" | "remove_follower_pending" | "action_cancelled"; label: string }
  | { category: "other"; type: "unavailable_marked" | "unavailable_cleared" | "note_edited" | "last_reviewed_updated"; label: string };

export interface SessionAccountChanges {
  username: string;
  changes: SessionChange[];
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface SessionCounts {
  reviewed: number;
  sentBackToReview: number;
  tagsAdded: number;
  tagsRemoved: number;
  pendingUnfollow: number;
  pendingRemoveFollower: number;
  actionsCancelled: number;
  unavailableMarked: number;
  unavailableCleared: number;
  notesEdited: number;
  lastReviewedUpdated: number;
}

export interface SessionDiff {
  accounts: SessionAccountChanges[];
  changedAccounts: number;
  changeCount: number;
  counts: SessionCounts;
  summary: Record<SessionCategory, number>;
  tagsAdded: TagCount[];
  tagsRemoved: TagCount[];
}

type DiffSource = DeepReadonly<Pick<Master, "accounts" | "actions">>;

function sortedTagCounts(counts: Map<string, number>): TagCount[] {
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

function pendingChange(action: DeepReadonly<Action>): SessionChange {
  return action.type === "unfollow"
    ? { category: "actions", type: "unfollow_pending", label: "Marked Unfollowed now" }
    : { category: "actions", type: "remove_follower_pending", label: "Marked Remove follower" };
}

/**
 * Net differences between the state loaded at session start and the current state.
 * Changes that end back at the baseline value are not reported.
 */
export function buildSessionDiff(baseline: DiffSource | null, current: DiffSource | null): SessionDiff {
  const baselineAccounts = baseline?.accounts ?? {};
  const currentAccounts = current?.accounts ?? {};
  const allAccountKeys = new Set([...Object.keys(baselineAccounts), ...Object.keys(currentAccounts)].map(usernameKey));

  const byUsername = new Map<string, SessionAccountChanges>();
  const counts: SessionCounts = {
    reviewed: 0,
    sentBackToReview: 0,
    tagsAdded: 0,
    tagsRemoved: 0,
    pendingUnfollow: 0,
    pendingRemoveFollower: 0,
    actionsCancelled: 0,
    unavailableMarked: 0,
    unavailableCleared: 0,
    notesEdited: 0,
    lastReviewedUpdated: 0,
  };
  const tagAddedCounts = new Map<string, number>();
  const tagRemovedCounts = new Map<string, number>();

  function addChange(username: string, change: SessionChange): void {
    const key = usernameKey(username);
    let entry = byUsername.get(key);
    if (!entry) {
      entry = { username: username || key, changes: [] };
      byUsername.set(key, entry);
    }
    entry.changes.push(change);
  }

  for (const key of allAccountKeys) {
    const beforeAccount = baselineAccounts[key];
    const afterAccount = currentAccounts[key];
    if (!beforeAccount && !afterAccount) continue;

    const username = afterAccount?.username || beforeAccount?.username || key;
    const before = beforeAccount?.review ?? createReview();
    const after = afterAccount?.review ?? createReview();

    if (before.reviewed !== after.reviewed) {
      if (after.reviewed) {
        counts.reviewed += 1;
        addChange(username, { category: "reviews", type: "reviewed", label: "Marked reviewed" });
      } else {
        counts.sentBackToReview += 1;
        addChange(username, { category: "reviews", type: "unreviewed", label: "Sent back to review" });
      }
    }

    if (before.deleted_or_unavailable !== after.deleted_or_unavailable) {
      if (after.deleted_or_unavailable) {
        counts.unavailableMarked += 1;
        addChange(username, { category: "other", type: "unavailable_marked", label: "Marked unavailable" });
      } else {
        counts.unavailableCleared += 1;
        addChange(username, { category: "other", type: "unavailable_cleared", label: "Cleared unavailable" });
      }
    }

    const beforeTags = new Set(before.tags);
    const afterTags = new Set(after.tags);
    for (const tag of afterTags) {
      if (beforeTags.has(tag)) continue;
      counts.tagsAdded += 1;
      tagAddedCounts.set(tag, (tagAddedCounts.get(tag) ?? 0) + 1);
      addChange(username, { category: "tags", type: "tag_added", label: `Added tag ${tag}`, tag });
    }
    for (const tag of beforeTags) {
      if (afterTags.has(tag)) continue;
      counts.tagsRemoved += 1;
      tagRemovedCounts.set(tag, (tagRemovedCounts.get(tag) ?? 0) + 1);
      addChange(username, { category: "tags", type: "tag_removed", label: `Removed tag ${tag}`, tag });
    }

    if (before.notes !== after.notes) {
      counts.notesEdited += 1;
      addChange(username, { category: "other", type: "note_edited", label: "Edited note" });
    }

    if (before.reviewed === after.reviewed && before.last_reviewed_at !== after.last_reviewed_at) {
      counts.lastReviewedUpdated += 1;
      addChange(username, { category: "other", type: "last_reviewed_updated", label: "Updated last reviewed date" });
    }
  }

  const baselineActions = new Map((baseline?.actions ?? []).map(action => [action.action_id, action]));

  for (const action of current?.actions ?? []) {
    const before = baselineActions.get(action.action_id);
    const actionName = action.type === "unfollow" ? "unfollow" : "follower removal";
    if (before && before.status === action.status) continue;

    if (action.status === "pending") {
      if (action.type === "unfollow") counts.pendingUnfollow += 1;
      else counts.pendingRemoveFollower += 1;
      addChange(action.username, pendingChange(action));
    } else if (action.status === "cancelled") {
      counts.actionsCancelled += 1;
      addChange(action.username, { category: "actions", type: "action_cancelled", label: `Cancelled ${actionName}` });
    }
  }

  const accounts = [...byUsername.values()]
    .filter(entry => entry.changes.length)
    .sort((a, b) => a.username.localeCompare(b.username));

  const summary: Record<SessionCategory, number> = {
    reviews: counts.reviewed + counts.sentBackToReview,
    tags: counts.tagsAdded + counts.tagsRemoved,
    actions: counts.pendingUnfollow + counts.pendingRemoveFollower + counts.actionsCancelled,
    other: counts.unavailableMarked + counts.unavailableCleared + counts.notesEdited + counts.lastReviewedUpdated,
  };

  return {
    accounts,
    changedAccounts: accounts.length,
    changeCount: summary.reviews + summary.tags + summary.actions + summary.other,
    counts,
    summary,
    tagsAdded: sortedTagCounts(tagAddedCounts),
    tagsRemoved: sortedTagCounts(tagRemovedCounts),
  };
}
