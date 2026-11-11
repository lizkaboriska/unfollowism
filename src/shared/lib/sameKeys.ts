/** The two lists hold the same keys in the same order. */
export function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, i) => key === right[i]);
}
