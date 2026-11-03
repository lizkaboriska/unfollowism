import { followExists, planOf } from '../lib/decision.ts';
import {
  ACTION_TYPES,
  REVIEW_SCOPES,
  type ActionType,
  type PlanState,
  type ReadonlyAccount,
  type ReviewScope,
} from '../lib/types.ts';

/** Lists about the people who follow you: there, a card offers removing the follower. */
const FOLLOWER_SCOPES: readonly ReviewScope[] = [REVIEW_SCOPES.FOLLOWERS, REVIEW_SCOPES.FOLLOWS_YOU_ONLY];

/**
 * The one action a Review card offers to queue: removal in the follower lists, otherwise unfollow when you follow
 * them, else removal. Null when neither follow exists (a past account, which has no decision buttons).
 */
export function offeredAction(account: ReadonlyAccount, scope: ReviewScope): ActionType | null {
  const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;
  if (FOLLOWER_SCOPES.includes(scope) && followExists(account, REMOVE_FOLLOWER)) {
    return REMOVE_FOLLOWER;
  }
  if (followExists(account, UNFOLLOW)) {
    return UNFOLLOW;
  }
  return followExists(account, REMOVE_FOLLOWER) ? REMOVE_FOLLOWER : null;
}

export enum QueueButtonKind {
  /** "Queue unfollow": queues it. */
  OFFER = 'offer',
  /** "✓ Unfollow queued" / "✓ Unfollow done": undoes it. */
  QUEUED = 'queued',
  /** "✓ Both queued": opens the popup, where each can be undone. */
  BOTH = 'both',
}

/**
 * What the card's second button shows. A queued plan always shows, even when it isn't the offered action (a mutual
 * with its removal queued, seen in Following), so a queued account never looks undecided.
 */
export type QueueButton =
  | { kind: QueueButtonKind.OFFER; type: ActionType }
  | { kind: QueueButtonKind.QUEUED; type: ActionType; state: PlanState }
  | { kind: QueueButtonKind.BOTH }
  | null;

export function queueButton(account: ReadonlyAccount, scope: ReviewScope): QueueButton {
  const queued = Object.values(ACTION_TYPES).flatMap(type => {
    const state = planOf(account, type);
    return state === undefined ? [] : [{ type, state }];
  });
  const [only] = queued;
  if (queued.length > 1) {
    return { kind: QueueButtonKind.BOTH };
  }
  if (only) {
    return { kind: QueueButtonKind.QUEUED, ...only };
  }
  const offered = offeredAction(account, scope);
  return offered === null ? null : { kind: QueueButtonKind.OFFER, type: offered };
}
