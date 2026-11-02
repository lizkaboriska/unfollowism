import { account, follows } from '../../lib/__tests__/helpers.ts';
import { ACTION_TYPES, PLAN_STATES, REVIEW_SCOPES, setPlan, type ReviewScope } from '../../lib/index.ts';
import { QueueButtonKind, offeredAction, queueButton } from '../queueButton.ts';

const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;
const mutual = () => follows(account('mutual'), { following: true, followedBy: true });
const notBack = () => follows(account('notback'), { following: true });
const followerOnly = () => follows(account('fan'), { followedBy: true });
const past = () => follows(account('gone'), {});

test.each<[string, () => ReturnType<typeof account>, ReviewScope, string | null]>([
  // The follower lists offer removal…
  ['mutual in Followers', mutual, REVIEW_SCOPES.FOLLOWERS, REMOVE_FOLLOWER],
  ['follower-only in Follows you only', followerOnly, REVIEW_SCOPES.FOLLOWS_YOU_ONLY, REMOVE_FOLLOWER],
  // …other lists unfollow when you follow them…
  ['mutual in Following', mutual, REVIEW_SCOPES.FOLLOWING, UNFOLLOW],
  ['mutual in Mutual', mutual, REVIEW_SCOPES.MUTUAL, UNFOLLOW],
  ['mutual in Everyone now', mutual, REVIEW_SCOPES.ALL_CURRENT, UNFOLLOW],
  ['not following back in Everyone now', notBack, REVIEW_SCOPES.ALL_CURRENT, UNFOLLOW],
  // …else removal, and nothing when neither follow exists.
  ['follower-only in Everyone now', followerOnly, REVIEW_SCOPES.ALL_CURRENT, REMOVE_FOLLOWER],
  ['past account in Everyone incl. past', past, REVIEW_SCOPES.ALL_ACCOUNTS, null],
  ['past account in Followers', past, REVIEW_SCOPES.FOLLOWERS, null],
])('offers: %s', (_, make, scope, expected) => {
  expect(offeredAction(make(), scope)).toBe(expected);
});

test('the button shows what is queued, even when it is not the offered action', () => {
  const a = mutual();
  expect(queueButton(a, REVIEW_SCOPES.FOLLOWING)).toEqual({ kind: QueueButtonKind.OFFER, type: UNFOLLOW });

  setPlan(a, REMOVE_FOLLOWER, PLAN_STATES.PLANNED); // queued from the popup
  expect(queueButton(a, REVIEW_SCOPES.FOLLOWING)).toEqual({
    kind: QueueButtonKind.QUEUED,
    type: REMOVE_FOLLOWER,
    state: PLAN_STATES.PLANNED,
  });

  setPlan(a, UNFOLLOW, PLAN_STATES.PLANNED);
  expect(queueButton(a, REVIEW_SCOPES.FOLLOWING)).toEqual({ kind: QueueButtonKind.BOTH });

  setPlan(a, REMOVE_FOLLOWER, undefined);
  setPlan(a, UNFOLLOW, PLAN_STATES.DONE); // marked done in To do
  expect(queueButton(a, REVIEW_SCOPES.FOLLOWERS)).toEqual({
    kind: QueueButtonKind.QUEUED,
    type: UNFOLLOW,
    state: PLAN_STATES.DONE,
  });
});

test('a past account has no queue button', () => {
  expect(queueButton(past(), REVIEW_SCOPES.ALL_ACCOUNTS)).toBeNull();
});
