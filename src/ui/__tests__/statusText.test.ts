import { ACTION_TYPES, type ImportSummary } from "../../core/index.ts";
import { STATUS_EVENTS, type StatusEvent } from "../../store/statuses.ts";
import { statusText } from "../statusText.ts";

const summary: ImportSummary = {
  exportChanged: true,
  followingCount: 1,
  followersCount: 1,
  newFollowers: 2,
  lostFollowers: 1,
  confirmed: { [ACTION_TYPES.UNFOLLOW]: 0, [ACTION_TYPES.REMOVE_FOLLOWER]: 0 },
};
const imported = (overrides: Partial<ImportSummary> = {}, isNewMaster = false): StatusEvent =>
  ({ type: STATUS_EVENTS.IMPORTED, isNewMaster, followerFileCount: 1, summary: { ...summary, ...overrides } });

test.each([
  ["nothing yet", null, ""],
  ["new master", imported({}, true), "Started a new master from 1 follower file. 1 following, 1 followers. Save master to keep it."],
  ["changed export with confirmations", imported({ confirmed: { [ACTION_TYPES.UNFOLLOW]: 2, [ACTION_TYPES.REMOVE_FOLLOWER]: 1 } }),
    "New export loaded from 1 follower file — not saved yet. 1 following, 1 followers. Since the last import: 2 new followers, 1 lost follower. Confirmed 2 unfollows and 1 follower removal."],
  ["same export", imported({ exportChanged: false }),
    "Loaded 1 follower file: same as the last import. 1 following, 1 followers. From that import: 2 new followers, 1 lost follower."],
  ["saved", { type: STATUS_EVENTS.SAVED, filename: "m.json", changedWhileSaving: false }, "Master saved as m.json. Keep this file: import it next time."],
  ["saved while editing", { type: STATUS_EVENTS.SAVED, filename: "m.json", changedWhileSaving: true }, "Master saved as m.json. Changes made while saving are not in that file yet."],
  ["save failed", { type: STATUS_EVENTS.SAVE_FAILED, reason: "disk full" }, "Could not save master: disk full"],
] as const)("%s", (_, status, expected) => {
  expect(statusText(status)).toBe(expected);
});
