import { computeCurrent, createDict, createReview, profileUrl, type Account, type Master, type Snapshot } from "../index.ts";

export function account(username = "alice"): Account {
  return {
    username,
    url: profileUrl(username),
    review: createReview(),
    current: computeCurrent(null, null),
  };
}

export function stateWith(...items: Account[]): Pick<Master, "accounts" | "actions"> {
  const accounts = createDict<Account>();
  for (const item of items) accounts[item.username.toLowerCase()] = item;
  return { accounts, actions: [] };
}

/** A snapshot whose change set lists the given usernames. */
export function snapshotWith({ id, date, capturedAt, stopped = [], lost = [] }: {
  id: string;
  date: string;
  capturedAt: string | null;
  stopped?: string[];
  lost?: string[];
}): Snapshot {
  return {
    snapshot_id: id,
    snapshot_date: date,
    captured_at: capturedAt,
    source_files: [],
    following: {},
    followers: {},
    counts: { following: 0, followers: 0, mutual: 0, not_following_back: 0, followers_you_do_not_follow: 0 },
    changes_from_previous_snapshot: { newly_following: [], stopped_following: stopped, new_followers: [], lost_followers: lost },
  };
}

/** Non-null assertion for tests that fails with a readable message. */
export function must<T>(value: T | null | undefined, what = "value"): T {
  if (value == null) throw new Error(`Expected ${what} to be present`);
  return value;
}

export function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

/** Minimal Instagram export file contents. */
export function followingFile(...entries: [username: string, timestamp?: number][]) {
  return {
    relationships_following: entries.map(([username, timestamp = 1_700_000_000]) => ({
      title: username,
      string_list_data: [{ href: `https://www.instagram.com/_u/${username}`, timestamp }],
    })),
  };
}

export function followersFile(...entries: [username: string, timestamp?: number][]) {
  return entries.map(([username, timestamp = 1_700_000_000]) => ({
    title: "",
    media_list_data: [],
    string_list_data: [{ href: `https://www.instagram.com/${username}`, value: username, timestamp }],
  }));
}
