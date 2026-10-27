import { createReview } from "./review.ts";
import { ACTION_TYPES, type ActionType, type ReadonlyAccounts, type ValueOf } from "./types.ts";
import { usernameKey } from "./util.ts";

export const SESSION_CHANGES = {
  REVIEWED: "reviewed",
  UNREVIEWED: "unreviewed",
  TAG_ADDED: "tagAdded",
  TAG_REMOVED: "tagRemoved",
  ACTION_MARKED: "actionMarked",
  ACTION_CANCELLED: "actionCancelled",
  UNAVAILABLE_MARKED: "unavailableMarked",
  UNAVAILABLE_CLEARED: "unavailableCleared",
  NOTE_EDITED: "noteEdited",
  LAST_REVIEWED_UPDATED: "lastReviewedUpdated",
} as const;
export type SessionChangeType = ValueOf<typeof SESSION_CHANGES>;

type TagChangeType = typeof SESSION_CHANGES.TAG_ADDED | typeof SESSION_CHANGES.TAG_REMOVED;
type ActionChangeType = typeof SESSION_CHANGES.ACTION_MARKED | typeof SESSION_CHANGES.ACTION_CANCELLED;

/** One net change to one account since the session started. Wording is up to the UI. */
export type SessionChange =
  | { type: TagChangeType; tag: string }
  | { type: ActionChangeType; action: ActionType }
  | { type: Exclude<SessionChangeType, TagChangeType | ActionChangeType> };

export const SESSION_CATEGORIES = { REVIEWS: "reviews", TAGS: "tags", ACTIONS: "actions", OTHER: "other" } as const;
export type SessionCategory = ValueOf<typeof SESSION_CATEGORIES>;

export const SESSION_CHANGE_CATEGORY: Readonly<Record<SessionChangeType, SessionCategory>> = {
  [SESSION_CHANGES.REVIEWED]: SESSION_CATEGORIES.REVIEWS,
  [SESSION_CHANGES.UNREVIEWED]: SESSION_CATEGORIES.REVIEWS,
  [SESSION_CHANGES.TAG_ADDED]: SESSION_CATEGORIES.TAGS,
  [SESSION_CHANGES.TAG_REMOVED]: SESSION_CATEGORIES.TAGS,
  [SESSION_CHANGES.ACTION_MARKED]: SESSION_CATEGORIES.ACTIONS,
  [SESSION_CHANGES.ACTION_CANCELLED]: SESSION_CATEGORIES.ACTIONS,
  [SESSION_CHANGES.UNAVAILABLE_MARKED]: SESSION_CATEGORIES.OTHER,
  [SESSION_CHANGES.UNAVAILABLE_CLEARED]: SESSION_CATEGORIES.OTHER,
  [SESSION_CHANGES.NOTE_EDITED]: SESSION_CATEGORIES.OTHER,
  [SESSION_CHANGES.LAST_REVIEWED_UPDATED]: SESSION_CATEGORIES.OTHER,
};

export interface SessionAccountChanges {
  username: string;
  changes: SessionChange[];
}

/**
 * Net differences per account between the session's start and now, sorted by username.
 * Changes that end back at the start value are not reported.
 */
export function buildSessionDiff(baseline: ReadonlyAccounts, current: ReadonlyAccounts): SessionAccountChanges[] {
  const result: SessionAccountChanges[] = [];

  for (const key of new Set([...Object.keys(baseline), ...Object.keys(current)].map(usernameKey))) {
    const beforeAccount = baseline[key];
    const afterAccount = current[key];
    const before = beforeAccount?.review ?? createReview();
    const after = afterAccount?.review ?? createReview();
    const changes: SessionChange[] = [];

    if (before.reviewed !== after.reviewed) changes.push({ type: after.reviewed ? SESSION_CHANGES.REVIEWED : SESSION_CHANGES.UNREVIEWED });
    if (before.unavailable !== after.unavailable) changes.push({ type: after.unavailable ? SESSION_CHANGES.UNAVAILABLE_MARKED : SESSION_CHANGES.UNAVAILABLE_CLEARED });
    for (const tag of after.tags) if (!before.tags.includes(tag)) changes.push({ type: SESSION_CHANGES.TAG_ADDED, tag });
    for (const tag of before.tags) if (!after.tags.includes(tag)) changes.push({ type: SESSION_CHANGES.TAG_REMOVED, tag });
    if (before.notes !== after.notes) changes.push({ type: SESSION_CHANGES.NOTE_EDITED });
    if (before.reviewed === after.reviewed && before.lastReviewedAt !== after.lastReviewedAt) changes.push({ type: SESSION_CHANGES.LAST_REVIEWED_UPDATED });

    const beforePending = beforeAccount?.actions.pending ?? [];
    const afterPending = afterAccount?.actions.pending ?? [];
    for (const action of Object.values(ACTION_TYPES)) {
      const was = beforePending.includes(action);
      const is = afterPending.includes(action);
      // Confirmation only happens on import, which starts a new session, so a pending action that went away was cancelled.
      if (was !== is) changes.push({ type: is ? SESSION_CHANGES.ACTION_MARKED : SESSION_CHANGES.ACTION_CANCELLED, action });
    }

    if (changes.length) result.push({ username: afterAccount?.username ?? beforeAccount?.username ?? key, changes });
  }

  return result.sort((a, b) => a.username.localeCompare(b.username));
}

export interface TagCount {
  tag: string;
  count: number;
}

export interface SessionSummary {
  changedAccounts: number;
  changeCount: number;
  byCategory: Record<SessionCategory, number>;
  /** Most frequent first. */
  tagsAdded: TagCount[];
  tagsRemoved: TagCount[];
}

function tagCounts(accounts: readonly SessionAccountChanges[], type: TagChangeType): TagCount[] {
  const counts = new Map<string, number>();
  for (const { changes } of accounts) {
    for (const change of changes) if (change.type === type) counts.set(change.tag, (counts.get(change.tag) ?? 0) + 1);
  }
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function summarizeSession(accounts: readonly SessionAccountChanges[]): SessionSummary {
  const byCategory: Record<SessionCategory, number> = {
    [SESSION_CATEGORIES.REVIEWS]: 0,
    [SESSION_CATEGORIES.TAGS]: 0,
    [SESSION_CATEGORIES.ACTIONS]: 0,
    [SESSION_CATEGORIES.OTHER]: 0,
  };
  let changeCount = 0;
  for (const { changes } of accounts) {
    for (const change of changes) {
      byCategory[SESSION_CHANGE_CATEGORY[change.type]] += 1;
      changeCount += 1;
    }
  }
  return {
    changedAccounts: accounts.length,
    changeCount,
    byCategory,
    tagsAdded: tagCounts(accounts, SESSION_CHANGES.TAG_ADDED),
    tagsRemoved: tagCounts(accounts, SESSION_CHANGES.TAG_REMOVED),
  };
}
