import type { ParsedAccount } from "./types.ts";
import { isRecord, numberOrNull, profileUrl, usernameKey } from "./util.ts";

function firstEntry(item: Record<string, unknown>): Record<string, unknown> {
  const list = item.string_list_data;
  const first: unknown = Array.isArray(list) ? list[0] : undefined;
  return isRecord(first) ? first : {};
}

function toParsed(username: string, first: Record<string, unknown>): ParsedAccount {
  const href = typeof first.href === "string" && first.href ? first.href : profileUrl(username);
  return {
    username,
    url: href.replace("/_u/", "/"),
    timestamp: numberOrNull(first.timestamp),
  };
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

/** Instagram `following.json`: `{ relationships_following: [...] }` (or a bare array). The username is in `title`. */
export function parseFollowingJson(raw: unknown): ParsedAccount[] {
  const items: unknown[] = Array.isArray(raw) ? raw : isRecord(raw) && Array.isArray(raw.relationships_following) ? raw.relationships_following : [];
  const result: ParsedAccount[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const first = firstEntry(item);
    const username = nonEmptyString(item.title) ?? nonEmptyString(first.value);
    if (username) result.push(toParsed(username, first));
  }
  return result;
}

/** Instagram `followers_N.json`: a bare array. The username is in `string_list_data[0].value`. */
export function parseFollowersJson(raw: unknown): ParsedAccount[] {
  const items: unknown[] = Array.isArray(raw) ? raw : [];
  const result: ParsedAccount[] = [];
  for (const item of items) {
    if (!isRecord(item)) continue;
    const first = firstEntry(item);
    const username = nonEmptyString(first.value) ?? nonEmptyString(item.title);
    if (username) result.push(toParsed(username, first));
  }
  return result;
}

/** Case-insensitive dedupe; the entry with the newest timestamp wins, ties keep the first. */
export function dedupeAccounts(items: readonly ParsedAccount[]): ParsedAccount[] {
  const byUsername = new Map<string, ParsedAccount>();
  for (const item of items) {
    const key = usernameKey(item.username);
    if (!key) continue;
    const existing = byUsername.get(key);
    if (!existing || (item.timestamp ?? 0) > (existing.timestamp ?? 0)) byUsername.set(key, item);
  }
  return [...byUsername.values()];
}
