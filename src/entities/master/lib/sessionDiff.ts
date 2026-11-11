import type { ValueOf } from '@/shared/lib/valueOf.ts';

import { copyDecision } from './account.ts';
import { createReview } from './review.ts';
import type { Decision, ReadonlyAccounts } from './types.ts';
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

  return result.sort((first, second) => first.username.localeCompare(second.username));
}

export enum TagChangeKind {
  ADDED = 'added',
  REMOVED = 'removed',
  /** Exactly the accounts that lost one tag gained another: most likely Rename in Manage tags. */
  RENAMED = 'renamed',
}

/** One tag change shared by several accounts. `usernames` keeps the diff's order (by username). */
export type TagChangeRow =
  | { kind: TagChangeKind.ADDED | TagChangeKind.REMOVED; tag: string; usernames: string[] }
  | { kind: TagChangeKind.RENAMED; from: string; to: string; usernames: string[] };

export interface GroupedSessionChanges {
  /** Most accounts first, then by tag name. */
  tagRows: TagChangeRow[];
  /** Every other change, per account; an account whose only changes are tags is left out. */
  accounts: SessionAccountChanges[];
}

const isTagChange = (change: SessionChange): change is { type: TagChangeType; tag: string } =>
  change.type === SESSION_CHANGES.TAG_ADDED || change.type === SESSION_CHANGES.TAG_REMOVED;

/** Splits the session diff into tag rows (one per tag, renames spotted) and the remaining per-account changes. */
export function groupSessionChanges(diff: readonly SessionAccountChanges[]): GroupedSessionChanges {
  const added = new Map<string, string[]>();
  const removed = new Map<string, string[]>();
  const accounts: SessionAccountChanges[] = [];

  for (const { username, changes } of diff) {
    const rest: SessionChange[] = [];
    for (const change of changes) {
      if (isTagChange(change)) {
        const byTag = change.type === SESSION_CHANGES.TAG_ADDED ? added : removed;
        const usernames = byTag.get(change.tag);
        if (usernames) {
          usernames.push(username);
        } else {
          byTag.set(change.tag, [username]);
        }
      } else {
        rest.push(change);
      }
    }
    if (rest.length) {
      accounts.push({ username, changes: rest });
    }
  }

  // A rename: one removed tag and one added tag with exactly the same accounts, and no other tag shares them.
  const sameAccounts = new Map<string, { removed: string[]; added: string[] }>();
  const group = (usernames: readonly string[]) => {
    const key = usernames.join('\n'); // both lists follow the diff's order, so equal sets give equal keys
    let entry = sameAccounts.get(key);
    if (!entry) {
      entry = { removed: [], added: [] };
      sameAccounts.set(key, entry);
    }
    return entry;
  };
  for (const [tag, usernames] of removed) {
    group(usernames).removed.push(tag);
  }
  for (const [tag, usernames] of added) {
    group(usernames).added.push(tag);
  }

  const tagRows: TagChangeRow[] = [];
  for (const entry of sameAccounts.values()) {
    const [from, to] = [entry.removed[0], entry.added[0]];
    if (entry.removed.length === 1 && entry.added.length === 1 && from !== undefined && to !== undefined) {
      tagRows.push({ kind: TagChangeKind.RENAMED, from, to, usernames: removed.get(from) ?? [] });
      removed.delete(from);
      added.delete(to);
    }
  }
  for (const [tag, usernames] of added) {
    tagRows.push({ kind: TagChangeKind.ADDED, tag, usernames });
  }
  for (const [tag, usernames] of removed) {
    tagRows.push({ kind: TagChangeKind.REMOVED, tag, usernames });
  }

  const rowTag = (row: TagChangeRow) => (row.kind === TagChangeKind.RENAMED ? row.from : row.tag);
  tagRows.sort(
    (first, second) => second.usernames.length - first.usernames.length || rowTag(first).localeCompare(rowTag(second)),
  );
  return { tagRows, accounts };
}
