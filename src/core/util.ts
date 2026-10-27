export function usernameKey(value: unknown): string {
  const text = typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
  return text.trim().toLowerCase();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** JSON round-trip clone: the master only ever holds JSON data. */
export function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function stringOrNull(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Prototype-free dictionary. Instagram usernames such as "constructor" or "__proto__"
 * are valid, and must not collide with Object.prototype members.
 */
export function createDict<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

export function profileUrl(username: string): string {
  return `https://www.instagram.com/${username}`;
}
