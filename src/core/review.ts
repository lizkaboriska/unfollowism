import type { Account, Review } from "./types.ts";

export function createReview(): Review {
  return {
    reviewed: false,
    last_reviewed_at: null,
    deleted_or_unavailable: false,
    tags: [],
    notes: "",
  };
}

/** WRITE: un-reviewing keeps last_reviewed_at as history. */
export function markReviewed(account: Account, reviewed: boolean, timestamp: string): void {
  account.review.reviewed = reviewed;
  if (reviewed) account.review.last_reviewed_at = timestamp || account.review.last_reviewed_at;
}
