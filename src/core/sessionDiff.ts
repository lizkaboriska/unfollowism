import { copyDecision } from './account.ts';
import { createReview } from './review.ts';
import type { Decision, ReadonlyAccounts, ValueOf } from './types.ts';
import { usernameKey } from './util.ts';

export const SESSION_CHANGES = {
  /** Kept, queued, a plan marked done, or back to needing a decision. */
  DECISION_CHANGED: 'decisionChanged',
  TAG_ADDED: 'tagAdded',
  TAG_REMOVED: 'tagRemoved',
  UNAVAILABLE_MARKED: 'unavailableMarked',
  UNAVAILABLE_CLEARED: 'unavailableCleared',
  NOTE_EDITED: 'noteEdited',
  /** The account is gone: the old name of a confirmed rename. */
  ACCOUNT_REMOVED: 'accountRemoved',
  /** A suggested rename was dismissed. */
  RENAME_DISMISSED: 'renameDismissed',
} as const;
export type SessionChangeType = ValueOf<typeof SESSION_CHANGES>;

export type TagChangeType = typeof SESSION_CHANGES.TAG_ADDED | typeof SESSION_CHANGES.TAG_REMOVED;
type DecisionChangeType = typeof SESSION_CHANGES.DECISION_CHANGED;

/** One net change to one account since the session started. Wording is up to the UI. */
export type SessionChange =
  | { type: TagChangeType; tag: string }
  /** `null` = needs a decision. */
  | { type: DecisionChangeType; from: Decision | null; to: Decision | null }
  | { type: Exclude<SessionChangeType, TagChangeType | DecisionChangeType> };

export const SESSION_CATEGORIES = { DECISIONS: 'decisions', TAGS: 'tags', OTHER: 'other' } as const;
export type SessionCategory = ValueOf<typeof SESSION_CATEGORIES>;

export const SESSION_CHANGE_CATEGORY: Readonly<Record<SessionChangeType, SessionCategory>> = {
  [SESSION_CHANGES.DECISION_CHANGED]: SESSION_CATEGORIES.DECISIONS,
  [SESSION_CHANGES.TAG_ADDED]: SESSION_CATEGORIES.TAGS,
  [SESSION_CHANGES.TAG_REMOVED]: SESSION_CATEGORIES.TAGS,
  [SESSION_CHANGES.UNAVAILABLE_MARKED]: SESSION_CATEGORIES.OTHER,
  [SESSION_CHANGES.UNAVAILABLE_CLEARED]: SESSION_CATEGORIES.OTHER,
  [SESSION_CHANGES.NOTE_EDITED]: SESSION_CATEGORIES.OTHER,
  [SESSION_CHANGES.ACCOUNT_REMOVED]: SESSION_CATEGORIES.OTHER,
  [SESSION_CHANGES.RENAME_DISMISSED]: SESSION_CATEGORIES.OTHER,
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
    if (beforeAccount && !afterAccount) {
      // its work moved elsewhere
      result.push({ username: beforeAccount.username, changes: [{ type: SESSION_CHANGES.ACCOUNT_REMOVED }] });
      continue;
    }
    const before = beforeAccount?.review ?? createReview();
    const after = afterAccount?.review ?? createReview();
    const changes: SessionChange[] = [];

    const decisionBefore = beforeAccount?.decision ?? null;
    const decisionAfter = afterAccount?.decision ?? null;
    if (JSON.stringify(decisionBefore) !== JSON.stringify(decisionAfter)) {
      changes.push({
        type: SESSION_CHANGES.DECISION_CHANGED,
        from: decisionBefore && copyDecision(decisionBefore),
        to: decisionAfter && copyDecision(decisionAfter),
      });
    }
    if (before.unavailable !== after.unavailable) {
      changes.push({
        type: after.unavailable ? SESSION_CHANGES.UNAVAILABLE_MARKED : SESSION_CHANGES.UNAVAILABLE_CLEARED,
      });
    }
    for (const tag of after.tags) {
      if (!before.tags.includes(tag)) {
        changes.push({ type: SESSION_CHANGES.TAG_ADDED, tag });
      }
    }
    for (const tag of before.tags) {
      if (!after.tags.includes(tag)) {
        changes.push({ type: SESSION_CHANGES.TAG_REMOVED, tag });
      }
    }
    if (before.notes !== after.notes) {
      changes.push({ type: SESSION_CHANGES.NOTE_EDITED });
    }
    if (beforeAccount?.renameSuggestion && !afterAccount?.renameSuggestion) {
      changes.push({ type: SESSION_CHANGES.RENAME_DISMISSED });
    }

    if (changes.length) {
      result.push({ username: afterAccount?.username ?? beforeAccount?.username ?? key, changes });
    }
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
    for (const change of changes) {
      if (change.type === type) {
        counts.set(change.tag, (counts.get(change.tag) ?? 0) + 1);
      }
    }
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

export function summarizeSession(accounts: readonly SessionAccountChanges[]): SessionSummary {
  const byCategory: Record<SessionCategory, number> = {
    [SESSION_CATEGORIES.DECISIONS]: 0,
    [SESSION_CATEGORIES.TAGS]: 0,
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
