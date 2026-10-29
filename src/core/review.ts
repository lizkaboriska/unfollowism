import type { Review } from './types.ts';

export function createReview(): Review {
  return {
    reviewed: false,
    unavailable: false,
    tags: [],
    notes: '',
  };
}
