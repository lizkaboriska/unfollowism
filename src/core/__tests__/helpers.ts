import { computeCurrent, createDict, createReview, profileUrl, type Account, type Master } from "../index.ts";

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
