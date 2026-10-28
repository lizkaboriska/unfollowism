import { ACTION_TYPES, SESSION_CATEGORIES, SESSION_CHANGES, type ActionType, type SessionCategory, type SessionChange } from "../core/index.ts";

/** How action change lines name each action: "Marked to unfollow", "Unfollow not done". */
const ACTION_WORDS: Record<ActionType, { verb: string; noun: string }> = {
  [ACTION_TYPES.UNFOLLOW]: { verb: "unfollow", noun: "Unfollow" },
  [ACTION_TYPES.REMOVE_FOLLOWER]: { verb: "remove", noun: "Remove" },
};

export const CATEGORY_LABELS: Record<SessionCategory, string> = {
  [SESSION_CATEGORIES.REVIEWS]: "Reviews",
  [SESSION_CATEGORIES.TAGS]: "Tags",
  [SESSION_CATEGORIES.ACTIONS]: "Actions",
  [SESSION_CATEGORIES.OTHER]: "Other",
};

/** A symbol and a sentence for one change line. */
export function changeLine(change: SessionChange): { symbol: string; text: string } {
  switch (change.type) {
    case SESSION_CHANGES.REVIEWED: return { symbol: "✓", text: "Marked reviewed" };
    case SESSION_CHANGES.UNREVIEWED: return { symbol: "↺", text: "Unmarked reviewed" };
    case SESSION_CHANGES.TAG_ADDED: return { symbol: "+", text: `Added tag ${change.tag}` };
    case SESSION_CHANGES.TAG_REMOVED: return { symbol: "−", text: `Removed tag ${change.tag}` };
    case SESSION_CHANGES.ACTION_MARKED: return { symbol: "↗", text: `Marked to ${ACTION_WORDS[change.action].verb}` };
    case SESSION_CHANGES.ACTION_DONE: return { symbol: "✔", text: `Marked ${ACTION_WORDS[change.action].verb} done` };
    case SESSION_CHANGES.ACTION_UNDONE: return { symbol: "↺", text: `${ACTION_WORDS[change.action].noun} not done` };
    case SESSION_CHANGES.ACTION_CANCELLED: return { symbol: "×", text: `Cancelled to ${ACTION_WORDS[change.action].verb}` };
    case SESSION_CHANGES.UNAVAILABLE_MARKED: return { symbol: "•", text: "Marked unavailable" };
    case SESSION_CHANGES.UNAVAILABLE_CLEARED: return { symbol: "•", text: "Cleared unavailable" };
    case SESSION_CHANGES.NOTE_EDITED: return { symbol: "✎", text: "Edited note" };
    case SESSION_CHANGES.ACCOUNT_REMOVED: return { symbol: "→", text: "Moved to its new name" };
  }
}
