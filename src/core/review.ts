import type { Account, Review } from "./types.ts";

export function createReview(): Review {
  return {
    reviewed: false,
    lastReviewedAt: null,
    unavailable: false,
    tags: [],
    notes: "",
  };
}

/** WRITE: un-reviewing keeps lastReviewedAt as history. */
export function markReviewed(account: Account, reviewed: boolean, timestamp: string): void {
  account.review.reviewed = reviewed;
  if (reviewed) account.review.lastReviewedAt = timestamp || account.review.lastReviewedAt;
}
