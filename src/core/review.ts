import type { Account, Review } from "./types.ts";
import { isRecord } from "./util.ts";

export function createReview(): Review {
  return {
    reviewed: false,
    last_reviewed_at: null,
    deleted_or_unavailable: false,
    tags: [],
    notes: "",
  };
}

export function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const tags = value.filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "").map(tag => tag.trim());
  return [...new Set(tags)];
}

/**
 * REPAIR: builds a valid Review from untrusted input. Never mutates its argument.
 * Field order matches the legacy migration so saved JSON stays byte-compatible.
 */
export function normalizeReview(raw: unknown): Review {
  const r = isRecord(raw) ? raw : {};
  return {
    reviewed: !!r.reviewed,
    last_reviewed_at: typeof r.last_reviewed_at === "string" && r.last_reviewed_at ? r.last_reviewed_at : null,
    deleted_or_unavailable: !!r.deleted_or_unavailable,
    tags: normalizeTags(r.tags),
    notes: typeof r.notes === "string" ? r.notes : "",
  };
}

/** WRITE: un-reviewing keeps last_reviewed_at as history. */
export function markReviewed(account: Account, reviewed: boolean, timestamp: string): void {
  account.review.reviewed = reviewed;
  if (reviewed) account.review.last_reviewed_at = timestamp || account.review.last_reviewed_at;
}
