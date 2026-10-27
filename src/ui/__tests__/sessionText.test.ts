import { ACTION_TYPES, SESSION_CHANGES, type SessionChange } from "../../core/index.ts";
import { changeLine } from "../sessionText.ts";

const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;

test.each<[SessionChange, string]>([
  [{ type: SESSION_CHANGES.REVIEWED }, "✓ Marked reviewed"],
  [{ type: SESSION_CHANGES.UNREVIEWED }, "↺ Unmarked reviewed"],
  [{ type: SESSION_CHANGES.TAG_ADDED, tag: "artist" }, "+ Added tag artist"],
  [{ type: SESSION_CHANGES.TAG_REMOVED, tag: "dog" }, "− Removed tag dog"],
  [{ type: SESSION_CHANGES.ACTION_MARKED, action: UNFOLLOW }, "↗ Marked to unfollow"],
  [{ type: SESSION_CHANGES.ACTION_DONE, action: REMOVE_FOLLOWER }, "✔ Marked remove done"],
  [{ type: SESSION_CHANGES.ACTION_UNDONE, action: UNFOLLOW }, "↺ Unfollow not done"],
  [{ type: SESSION_CHANGES.ACTION_CANCELLED, action: REMOVE_FOLLOWER }, "× Cancelled to remove"],
  [{ type: SESSION_CHANGES.UNAVAILABLE_MARKED }, "• Marked unavailable"],
  [{ type: SESSION_CHANGES.UNAVAILABLE_CLEARED }, "• Cleared unavailable"],
  [{ type: SESSION_CHANGES.NOTE_EDITED }, "✎ Edited note"],
])("%o", (change, expected) => {
  const { symbol, text } = changeLine(change);
  expect(`${symbol} ${text}`).toBe(expected);
});
