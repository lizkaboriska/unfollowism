/**
 * Prototype-free dictionary. Instagram usernames such as "constructor" or "__proto__"
 * are valid, and must not collide with Object.prototype members.
 */
export function createDict<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}
