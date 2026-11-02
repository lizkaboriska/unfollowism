import type { Review } from './types.ts';

export function createReview(): Review {
  return {
    unavailable: false,
    tags: [],
    notes: '',
  };
}
