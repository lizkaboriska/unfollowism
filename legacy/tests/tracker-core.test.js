const test = require('node:test');
const assert = require('node:assert/strict');

const {
  SCHEMA_VERSION,
  STATUS_SEMANTICS,
  createReview,
  ensureReview,
  markReviewed,
  parseFollowersJson,
  dedupeAccounts,
  syncCurrentRelationship,
  scopeMatches,
  reviewScopeAccounts,
  resetReviewedForScope,
  relationshipStats,
  reviewScopeStats,
  pendingAction,
  addPendingAction,
  cancelPendingAction,
  confirmPendingActions,
  actionStats,
  buildSessionDiff,
  normalizeMaster
} = require('../tracker-core.js');

function account(username = 'alice') {
  return {
    username,
    url: `https://www.instagram.com/${username}`,
    review: createReview(),
    current: {}
  };
}

function stateWith(...items) {
  return {
    accounts: Object.fromEntries(items.map(item => [item.username.toLowerCase(), item])),
    actions: []
  };
}

test('review state is reusable and keeps the last reviewed timestamp when reset', () => {
  const a = account();
  a.review.tags = ['artist'];
  a.review.notes = 'great illustrator';

  markReviewed(a, true, '2026-09-05T10:00:00Z');
  assert.equal(a.review.reviewed, true);
  assert.equal(a.review.last_reviewed_at, '2026-09-05T10:00:00Z');

  markReviewed(a, false, '2026-10-01T10:00:00Z');
  assert.equal(a.review.reviewed, false);
  assert.equal(a.review.last_reviewed_at, '2026-09-05T10:00:00Z');
  assert.deepEqual(a.review.tags, ['artist']);
  assert.equal(a.review.notes, 'great illustrator');
});

test('review scopes support overlapping following/follower views', () => {
  const mutual = account('mutual');
  syncCurrentRelationship(mutual, { username: 'mutual' }, { username: 'mutual' });
  const notBack = account('notback');
  syncCurrentRelationship(notBack, { username: 'notback' }, null);
  const followerOnly = account('follower');
  syncCurrentRelationship(followerOnly, null, { username: 'follower' });

  assert.equal(scopeMatches(mutual, 'following'), true);
  assert.equal(scopeMatches(mutual, 'followers'), true);
  assert.equal(scopeMatches(mutual, 'mutual'), true);
  assert.equal(scopeMatches(notBack, 'following'), true);
  assert.equal(scopeMatches(notBack, 'followers'), false);
  assert.equal(scopeMatches(followerOnly, 'followers'), true);
  assert.equal(scopeMatches(followerOnly, 'following'), false);
});

test('reset applies only to the requested scope and tag and preserves metadata', () => {
  const artistMutual = account('artist_mutual');
  artistMutual.review.tags = ['artist', 'friend'];
  artistMutual.review.notes = 'keep this';
  markReviewed(artistMutual, true, '2026-08-01T10:00:00Z');
  syncCurrentRelationship(artistMutual, { username: artistMutual.username }, { username: artistMutual.username });

  const artistNotBack = account('artist_notback');
  artistNotBack.review.tags = ['artist'];
  markReviewed(artistNotBack, true, '2026-08-02T10:00:00Z');
  syncCurrentRelationship(artistNotBack, { username: artistNotBack.username }, null);

  const friendMutual = account('friend_mutual');
  friendMutual.review.tags = ['friend'];
  markReviewed(friendMutual, true, '2026-08-03T10:00:00Z');
  syncCurrentRelationship(friendMutual, { username: friendMutual.username }, { username: friendMutual.username });

  const state = stateWith(artistMutual, artistNotBack, friendMutual);
  const reset = resetReviewedForScope(state, { scope: 'mutual', tag: 'artist' });

  assert.equal(reset, 1);
  assert.equal(artistMutual.review.reviewed, false);
  assert.equal(artistMutual.review.last_reviewed_at, '2026-08-01T10:00:00Z');
  assert.deepEqual(artistMutual.review.tags, ['artist', 'friend']);
  assert.equal(artistMutual.review.notes, 'keep this');
  assert.equal(artistNotBack.review.reviewed, true);
  assert.equal(friendMutual.review.reviewed, true);
});

test('scope stats describe whichever audit queue is selected', () => {
  const mutual = account('mutual');
  markReviewed(mutual, true, '2026-09-01T00:00:00Z');
  syncCurrentRelationship(mutual, { username: 'mutual' }, { username: 'mutual' });

  const notBack = account('notback');
  syncCurrentRelationship(notBack, { username: 'notback' }, null);

  const followerOnly = account('follower');
  syncCurrentRelationship(followerOnly, null, { username: 'follower' });

  const state = stateWith(mutual, notBack, followerOnly);
  assert.deepEqual(relationshipStats(state), {
    following: 2,
    followers: 2,
    mutual: 1,
    notFollowingBack: 1,
    followsYouOnly: 1,
    currentAccounts: 3
  });
  assert.deepEqual(reviewScopeStats(state, { scope: 'following' }), {
    total: 2,
    reviewed: 1,
    needsReview: 1,
    unavailable: 0
  });
  assert.deepEqual(reviewScopeStats(state, { scope: 'followers' }), {
    total: 2,
    reviewed: 1,
    needsReview: 1,
    unavailable: 0
  });
});

test('pending unfollow is a separate action and confirms only from stopped_following', () => {
  const a = account();
  syncCurrentRelationship(a, { username: 'alice' }, null);
  const state = stateWith(a);

  addPendingAction(state, a, 'unfollow', '2026-09-01T10:00:00Z');
  assert.ok(pendingAction(state, 'alice', 'unfollow'));
  assert.equal(a.review.reviewed, false, 'core action creation does not implicitly rewrite review state');

  // Still followed: cannot be confirmed even if a malformed snapshot mentions the name.
  let snapshot = {
    snapshot_id: 'snapshot_1',
    snapshot_date: '2026-09-02',
    captured_at: '2026-09-02T10:00:00Z',
    changes_from_previous_snapshot: { stopped_following: ['alice'], lost_followers: [] }
  };
  assert.equal(confirmPendingActions(state, snapshot).total, 0);

  syncCurrentRelationship(a, null, null);
  const confirmed = confirmPendingActions(state, snapshot);
  assert.deepEqual(confirmed, { unfollow: 1, remove_follower: 0, total: 1 });
  assert.equal(state.actions[0].status, 'confirmed');
  assert.equal(state.actions[0].confirmation_snapshot_id, 'snapshot_1');
});

test('remove follower is symmetric to unfollow and confirms from lost_followers', () => {
  const a = account();
  syncCurrentRelationship(a, null, { username: 'alice' });
  const state = stateWith(a);

  addPendingAction(state, a, 'remove_follower', '2026-09-01T10:00:00Z');
  syncCurrentRelationship(a, null, null);
  const snapshot = {
    snapshot_id: 'snapshot_2',
    snapshot_date: '2026-09-03',
    captured_at: '2026-09-03T10:00:00Z',
    changes_from_previous_snapshot: { stopped_following: [], lost_followers: ['Alice'] }
  };

  const confirmed = confirmPendingActions(state, snapshot);
  assert.deepEqual(confirmed, { unfollow: 0, remove_follower: 1, total: 1 });
  assert.equal(state.actions[0].type, 'remove_follower');
  assert.equal(state.actions[0].status, 'confirmed');
});

test('pending action can be cancelled without affecting account review data', () => {
  const a = account();
  a.review.tags = ['artist'];
  syncCurrentRelationship(a, { username: 'alice' }, { username: 'alice' });
  const state = stateWith(a);
  addPendingAction(state, a, 'unfollow', '2026-09-01T10:00:00Z');

  assert.equal(cancelPendingAction(state, 'alice', 'unfollow', '2026-09-01T11:00:00Z'), true);
  assert.equal(pendingAction(state, 'alice', 'unfollow'), null);
  assert.equal(state.actions[0].status, 'cancelled');
  assert.deepEqual(a.review.tags, ['artist']);
});

test('normalization migrates legacy review fields into v6 review + actions', () => {
  const old = {
    schema_version: 5,
    status_semantics: { old: true },
    tag_options: ['artist'],
    accounts: {
      alice: {
        username: 'alice',
        current: { you_follow: true, follows_you: false, relationship: 'not_following_back' },
        review: {
          reviewed: true,
          deleted_or_unavailable: false,
          manual_unfollowed_now: true,
          manual_unfollowed_marked_at: '2026-09-01T10:00:00Z',
          manual_unfollow_confirmed_snapshot_id: null,
          decision: 'unfollowed',
          tags: ['artist', 'photographer'],
          notes: 'legacy'
        }
      }
    },
    snapshots: [],
    actions: [{
      type: 'manual_unfollow',
      status: 'confirmed',
      username: 'older',
      marked_at: '2026-01-01T00:00:00Z',
      confirmed_at: '2026-01-02T00:00:00Z',
      confirmation_snapshot_id: 'legacy_snapshot'
    }]
  };

  const { next, changed } = normalizeMaster(old);
  assert.equal(changed, true);
  assert.equal(next.schema_version, SCHEMA_VERSION);
  assert.deepEqual(next.status_semantics, STATUS_SEMANTICS);
  assert.deepEqual(next.accounts.alice.review, {
    reviewed: true,
    last_reviewed_at: null,
    deleted_or_unavailable: false,
    tags: ['artist', 'photographer'],
    notes: 'legacy'
  });
  assert.ok(next.tag_options.includes('photographer'));
  assert.ok(pendingAction(next, 'alice', 'unfollow'));
  assert.equal(next.actions.find(a => a.username === 'older').type, 'unfollow');
  assert.ok(next.actions.every(a => a.action_id));
});

test('legacy pending unfollow can be confirmed by the latest saved snapshot after migration', () => {
  const old = {
    schema_version: 3,
    accounts: {
      alice: {
        username: 'alice',
        current: { you_follow: false, follows_you: false, relationship: 'neither' },
        review: {
          reviewed: true,
          deleted_or_unavailable: false,
          manual_unfollowed_now: true,
          tags: [],
          notes: ''
        }
      }
    },
    tag_options: [],
    snapshots: [{
      snapshot_id: 'snapshot_latest',
      snapshot_date: '2026-09-04',
      captured_at: null,
      source_files: [],
      following: {},
      followers: {},
      changes_from_previous_snapshot: { stopped_following: ['alice'], lost_followers: [] }
    }]
  };

  const { next } = normalizeMaster(old);
  syncCurrentRelationship(next.accounts.alice, null, null);
  const result = confirmPendingActions(next, next.snapshots[0], '2099-01-01T00:00:00Z');
  assert.equal(result.unfollow, 1);
  const action = next.actions.find(a => a.username === 'alice');
  assert.equal(action.status, 'confirmed');
  assert.equal(action.confirmed_at, null, 'legacy date-only snapshot must not invent an exact confirmation time');
  assert.equal(action.confirmation_snapshot_date, '2026-09-04');
});

test('multiple follower export chunks can be parsed and deduplicated case-insensitively', () => {
  const file1 = [
    { string_list_data: [{ value: 'Alice', timestamp: 10 }] },
    { string_list_data: [{ value: 'Bob', timestamp: 20 }] }
  ];
  const file2 = [
    { string_list_data: [{ value: 'alice', timestamp: 30 }] },
    { string_list_data: [{ value: 'Carol', timestamp: 40 }] }
  ];

  const merged = dedupeAccounts([...parseFollowersJson(file1), ...parseFollowersJson(file2)]);
  assert.equal(merged.length, 3);
  assert.equal(merged.find(x => x.username.toLowerCase() === 'alice').timestamp, 30);
});

test('review query can combine scope, tag and status', () => {
  const a = account('artist_reviewed');
  a.review.tags = ['artist'];
  markReviewed(a, true, '2026-09-01T00:00:00Z');
  syncCurrentRelationship(a, { username: a.username }, { username: a.username });

  const b = account('artist_pending');
  b.review.tags = ['artist'];
  syncCurrentRelationship(b, { username: b.username }, null);

  const c = account('friend_pending');
  c.review.tags = ['friend'];
  syncCurrentRelationship(c, { username: c.username }, null);

  const state = stateWith(a, b, c);
  const result = reviewScopeAccounts(state, { scope: 'following', tag: 'artist', reviewStatus: 'needs_review' });
  assert.deepEqual(result.map(x => x.username), ['artist_pending']);
});

test('ensureReview repairs malformed optional fields without inventing review history', () => {
  const a = { username: 'alice', review: { reviewed: 1, tags: ['artist', 'artist', '', null], notes: null } };
  const review = ensureReview(a);
  assert.equal(review.reviewed, true);
  assert.equal(review.last_reviewed_at, null);
  assert.deepEqual(review.tags, ['artist']);
  assert.equal(review.notes, '');
});


test('session diff reports only net review, tag, action and metadata changes', () => {
  const a = account('alice');
  a.review.tags = ['artist'];
  a.review.notes = 'before';
  syncCurrentRelationship(a, { username: 'alice' }, { username: 'alice' });
  const baseline = stateWith(a);

  const current = JSON.parse(JSON.stringify(baseline));
  const currentAlice = current.accounts.alice;
  markReviewed(currentAlice, true, '2026-09-05T18:00:00Z');
  currentAlice.review.tags = ['artist', 'photography'];
  currentAlice.review.notes = 'after';
  addPendingAction(current, currentAlice, 'unfollow', '2026-09-05T18:05:00Z');

  const diff = buildSessionDiff(baseline, current);
  assert.equal(diff.changedAccounts, 1);
  assert.equal(diff.changeCount, 4);
  assert.deepEqual(diff.summary, { reviews: 1, tags: 1, actions: 1, other: 1 });
  assert.deepEqual(diff.tagsAdded, [{ tag: 'photography', count: 1 }]);
  assert.equal(diff.accounts[0].changes.some(change => change.type === 'reviewed'), true);
  assert.equal(diff.accounts[0].changes.some(change => change.type === 'tag_added' && change.tag === 'photography'), true);
  assert.equal(diff.accounts[0].changes.some(change => change.type === 'unfollow_pending'), true);
  assert.equal(diff.accounts[0].changes.some(change => change.type === 'note_edited'), true);
});

test('session diff ignores tag edits that end back at baseline but keeps persistent last-reviewed changes', () => {
  const a = account('alice');
  a.review.tags = ['artist'];
  syncCurrentRelationship(a, { username: 'alice' }, null);
  const baseline = stateWith(a);
  const current = JSON.parse(JSON.stringify(baseline));

  current.accounts.alice.review.tags.push('fashion');
  current.accounts.alice.review.tags = ['artist'];
  markReviewed(current.accounts.alice, true, '2026-09-05T18:00:00Z');
  markReviewed(current.accounts.alice, false, '2026-09-05T18:01:00Z');

  const diff = buildSessionDiff(baseline, current);
  assert.equal(diff.changedAccounts, 1);
  assert.equal(diff.changeCount, 1);
  assert.equal(diff.accounts[0].changes[0].type, 'last_reviewed_updated');
});

test('session diff groups tag additions across accounts for review', () => {
  const a = account('alice');
  const b = account('bob');
  syncCurrentRelationship(a, { username: 'alice' }, null);
  syncCurrentRelationship(b, { username: 'bob' }, null);
  const baseline = stateWith(a, b);
  const current = JSON.parse(JSON.stringify(baseline));
  current.accounts.alice.review.tags = ['artist'];
  current.accounts.bob.review.tags = ['artist', 'photography'];

  const diff = buildSessionDiff(baseline, current);
  assert.deepEqual(diff.tagsAdded, [
    { tag: 'artist', count: 2 },
    { tag: 'photography', count: 1 }
  ]);
  assert.equal(diff.summary.tags, 3);
  assert.equal(diff.changedAccounts, 2);
});
