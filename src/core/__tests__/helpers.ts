import { ImportError, createAccount, createDict, type Account, type ImportProblem, type Master } from "../index.ts";

/** The problem `run` throws as an ImportError; fails the test if it throws anything else or nothing. */
export function problemOf(run: () => unknown): ImportProblem {
  try {
    run();
  } catch (error) {
    if (error instanceof ImportError) return error.problem;
    throw error;
  }
  throw new Error("Expected an ImportError");
}

export function account(username = "alice"): Account {
  return createAccount(username);
}

/** Sets who follows whom on a test account (since = 1_700_000_000 unless given). */
export function follows(a: Account, { following = false, followedBy = false, since = 1_700_000_000 }: { following?: boolean; followedBy?: boolean; since?: number | null }): Account {
  a.following = following ? { since } : null;
  a.followedBy = followedBy ? { since } : null;
  return a;
}

export function stateWith(...items: Account[]): Pick<Master, "accounts"> {
  const accounts = createDict<Account>();
  for (const item of items) accounts[item.username.toLowerCase()] = item;
  return { accounts };
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
