(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.TrackerCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const SCHEMA_VERSION = 6;

  const STATUS_SEMANTICS = {
    reviewed: "Whether the account currently needs another personal review. Resetting this flag does not erase tags, notes, actions, or last_reviewed_at.",
    last_reviewed_at: "The most recent known time you marked the account reviewed. It remains when reviewed is reset to false.",
    deleted_or_unavailable: "Your account-level flag that the Instagram account appears deleted, disabled, or otherwise unavailable.",
    tags: "Persistent account metadata used to build focused review scopes. Tags do not reset with review state.",
    actions: "Things you manually did on Instagram. Pending actions are confirmed only by a later imported relationship snapshot.",
    action_unfollow: "You stopped following the account. Confirmation requires the account to disappear from Following.",
    action_remove_follower: "You removed the account from your followers. Confirmation requires the account to disappear from Followers."
  };

  const DEFAULT_TAG_OPTIONS = ["artist", "fashion", "lifestyle", "aesthetics", "acquaintance", "home", "dog"];
  const ACTION_TYPES = ["unfollow", "remove_follower"];
  const REVIEW_SCOPES = ["following", "followers", "mutual", "not_following_back", "follows_you_only", "all_current", "all_accounts"];

  function clone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function usernameKey(value) {
    return String(value || "").trim().toLowerCase();
  }

  function createReview() {
    return {
      reviewed: false,
      last_reviewed_at: null,
      deleted_or_unavailable: false,
      tags: [],
      notes: ""
    };
  }

  function ensureReview(account) {
    if (!account.review || typeof account.review !== "object") account.review = createReview();
    const review = account.review;

    review.reviewed = !!review.reviewed;
    if (!("last_reviewed_at" in review)) review.last_reviewed_at = null;
    review.deleted_or_unavailable = !!review.deleted_or_unavailable;
    if (!Array.isArray(review.tags)) review.tags = [];
    review.tags = [...new Set(review.tags.filter(tag => typeof tag === "string" && tag.trim()).map(tag => tag.trim()))];
    if (typeof review.notes !== "string") review.notes = "";

    return review;
  }

  function markReviewed(account, reviewed, timestamp = new Date().toISOString()) {
    const review = ensureReview(account);
    review.reviewed = !!reviewed;
    if (review.reviewed) review.last_reviewed_at = timestamp || review.last_reviewed_at || null;
    return review;
  }

  function parseFollowingJson(raw) {
    const items = Array.isArray(raw) ? raw : (raw?.relationships_following || []);
    const result = [];
    for (const item of items) {
      const first = (item?.string_list_data || [])[0] || {};
      const username = item?.title || first.value;
      if (!username) continue;
      result.push({
        username,
        url: (first.href || `https://www.instagram.com/${username}`).replace("/_u/", "/"),
        timestamp: first.timestamp ?? null
      });
    }
    return result;
  }

  function parseFollowersJson(raw) {
    const items = Array.isArray(raw) ? raw : [];
    const result = [];
    for (const item of items) {
      const first = (item?.string_list_data || [])[0] || {};
      const username = first.value || item?.title;
      if (!username) continue;
      result.push({
        username,
        url: (first.href || `https://www.instagram.com/${username}`).replace("/_u/", "/"),
        timestamp: first.timestamp ?? null
      });
    }
    return result;
  }

  function dedupeAccounts(items) {
    const byUsername = new Map();
    for (const item of items || []) {
      const key = usernameKey(item?.username);
      if (!key) continue;
      const existing = byUsername.get(key);
      if (!existing || (item.timestamp ?? 0) > (existing.timestamp ?? 0)) byUsername.set(key, item);
    }
    return [...byUsername.values()];
  }

  function sameUsernameSet(snapshotObj, currentSet) {
    const keys = Object.keys(snapshotObj || {}).map(usernameKey);
    if (keys.length !== currentSet.size) return false;
    const keySet = new Set(keys);
    for (const username of currentSet) {
      if (!keySet.has(usernameKey(username))) return false;
    }
    return true;
  }

  function syncCurrentRelationship(account, followingItem, followerItem) {
    ensureReview(account);
    const youFollow = !!followingItem;
    const followsYou = !!followerItem;

    account.current = {
      you_follow: youFollow,
      follows_you: followsYou,
      relationship:
        youFollow && followsYou ? "mutual" :
        youFollow ? "not_following_back" :
        followsYou ? "follows_you_only" : "neither",
      following_since_timestamp: followingItem?.timestamp ?? null,
      follower_since_timestamp: followerItem?.timestamp ?? null
    };

    return account.current;
  }

  function scopeMatches(account, scope = "following") {
    const current = account.current || {};
    if (scope === "following") return !!current.you_follow;
    if (scope === "followers") return !!current.follows_you;
    if (scope === "mutual") return current.relationship === "mutual";
    if (scope === "not_following_back") return current.relationship === "not_following_back";
    if (scope === "follows_you_only") return current.relationship === "follows_you_only";
    if (scope === "all_current") return !!current.you_follow || !!current.follows_you;
    if (scope === "all_accounts") return true;
    return false;
  }

  function tagMatches(account, tag = "") {
    const tags = ensureReview(account).tags;
    if (!tag) return true;
    if (tag === "untagged") return tags.length === 0;
    return tags.includes(tag);
  }

  function reviewStatusMatches(account, status = "all") {
    if (status === "all") return true;
    if (status === "reviewed") return !!ensureReview(account).reviewed;
    if (status === "needs_review") return !ensureReview(account).reviewed;
    return false;
  }

  function reviewScopeAccounts(sourceState, { scope = "following", tag = "", reviewStatus = "all", query = "" } = {}) {
    const q = String(query || "").trim().toLowerCase();
    return Object.values(sourceState.accounts || {}).filter(account => {
      if (!scopeMatches(account, scope)) return false;
      if (!tagMatches(account, tag)) return false;
      if (!reviewStatusMatches(account, reviewStatus)) return false;
      if (q && !usernameKey(account.username).includes(q)) return false;
      return true;
    });
  }

  function resetReviewedForScope(sourceState, { scope = "following", tag = "" } = {}) {
    const targets = reviewScopeAccounts(sourceState, { scope, tag, reviewStatus: "reviewed" });
    for (const account of targets) ensureReview(account).reviewed = false;
    return targets.length;
  }

  function relationshipStats(sourceState) {
    const all = Object.values(sourceState.accounts || {});
    const current = all.filter(a => a.current?.you_follow || a.current?.follows_you);
    return {
      following: all.filter(a => a.current?.you_follow).length,
      followers: all.filter(a => a.current?.follows_you).length,
      mutual: all.filter(a => a.current?.relationship === "mutual").length,
      notFollowingBack: all.filter(a => a.current?.relationship === "not_following_back").length,
      followsYouOnly: all.filter(a => a.current?.relationship === "follows_you_only").length,
      currentAccounts: current.length
    };
  }

  function reviewScopeStats(sourceState, { scope = "following", tag = "" } = {}) {
    const scoped = reviewScopeAccounts(sourceState, { scope, tag });
    const reviewed = scoped.filter(a => ensureReview(a).reviewed).length;
    return {
      total: scoped.length,
      reviewed,
      needsReview: scoped.length - reviewed,
      unavailable: scoped.filter(a => ensureReview(a).deleted_or_unavailable).length
    };
  }

  function ensureActions(sourceState) {
    if (!Array.isArray(sourceState.actions)) sourceState.actions = [];
    return sourceState.actions;
  }

  function actionId(sourceState, type, username, markedAt) {
    const safeTime = String(markedAt || "unknown").replace(/[^0-9A-Za-z]+/g, "").slice(0, 24) || "unknown";
    const safeUser = usernameKey(username).replace(/[^0-9a-z._-]+/g, "_").slice(0, 40) || "account";
    const base = `action_${type}_${safeUser}_${safeTime}`;
    const ids = new Set(ensureActions(sourceState).map(action => action.action_id).filter(Boolean));
    if (!ids.has(base)) return base;
    let suffix = 2;
    while (ids.has(`${base}_${suffix}`)) suffix += 1;
    return `${base}_${suffix}`;
  }

  function normalizeAction(sourceState, action, index = 0) {
    if (action.type === "manual_unfollow") action.type = "unfollow";
    if (!ACTION_TYPES.includes(action.type)) return action;
    if (!action.status) action.status = action.confirmed_at || action.confirmation_snapshot_id ? "confirmed" : "pending";
    if (!("marked_at" in action)) action.marked_at = null;
    if (!("confirmed_at" in action)) action.confirmed_at = null;
    if (!("cancelled_at" in action)) action.cancelled_at = null;
    if (!("confirmation_snapshot_id" in action)) action.confirmation_snapshot_id = null;
    if (!("confirmation_snapshot_date" in action)) action.confirmation_snapshot_date = null;
    if (!("relationship_at_mark" in action)) action.relationship_at_mark = null;
    if (!action.action_id) {
      action.action_id = actionId(sourceState, action.type, action.username || `legacy_${index + 1}`, action.marked_at || action.confirmed_at || `legacy_${index + 1}`);
    }
    return action;
  }

  function pendingAction(sourceState, username, type) {
    const key = usernameKey(username);
    return ensureActions(sourceState).find(action =>
      action.type === type &&
      action.status === "pending" &&
      usernameKey(action.username) === key
    ) || null;
  }

  function addPendingAction(sourceState, account, type, markedAt = new Date().toISOString(), { skipEligibility = false } = {}) {
    if (!ACTION_TYPES.includes(type)) throw new Error(`Unknown action type: ${type}`);
    const existing = pendingAction(sourceState, account.username, type);
    if (existing) return existing;

    if (!skipEligibility) {
      if (type === "unfollow" && !account.current?.you_follow) throw new Error("Cannot mark unfollow: this snapshot says you do not follow the account.");
      if (type === "remove_follower" && !account.current?.follows_you) throw new Error("Cannot mark follower removal: this snapshot says the account does not follow you.");
    }

    const action = {
      action_id: actionId(sourceState, type, account.username, markedAt),
      username: account.username,
      type,
      status: "pending",
      marked_at: markedAt || null,
      confirmed_at: null,
      cancelled_at: null,
      confirmation_snapshot_id: null,
      confirmation_snapshot_date: null,
      relationship_at_mark: {
        you_follow: !!account.current?.you_follow,
        follows_you: !!account.current?.follows_you
      }
    };
    ensureActions(sourceState).push(action);
    return action;
  }

  function cancelPendingAction(sourceState, username, type, cancelledAt = new Date().toISOString()) {
    const action = pendingAction(sourceState, username, type);
    if (!action) return false;
    action.status = "cancelled";
    action.cancelled_at = cancelledAt || null;
    return true;
  }

  function confirmationIso(snapshot, fallbackIso) {
    if (snapshot?.captured_at) return snapshot.captured_at;
    if (snapshot?.snapshot_date) return null;
    return fallbackIso;
  }

  function confirmPendingActions(sourceState, confirmationSnapshot, fallbackIso = new Date().toISOString()) {
    if (!confirmationSnapshot) return { unfollow: 0, remove_follower: 0, total: 0 };

    const changes = confirmationSnapshot.changes_from_previous_snapshot || {};
    const stoppedFollowing = new Set((changes.stopped_following || []).map(usernameKey));
    const lostFollowers = new Set((changes.lost_followers || []).map(usernameKey));
    const accounts = sourceState.accounts || {};
    const confirmed = { unfollow: 0, remove_follower: 0, total: 0 };

    for (const action of ensureActions(sourceState)) {
      if (action.status !== "pending" || !ACTION_TYPES.includes(action.type)) continue;
      const key = usernameKey(action.username);
      const account = accounts[key];
      const matchesChange = action.type === "unfollow" ? stoppedFollowing.has(key) : lostFollowers.has(key);
      const relationshipGone = action.type === "unfollow" ? !account?.current?.you_follow : !account?.current?.follows_you;
      if (!matchesChange || !relationshipGone) continue;

      action.status = "confirmed";
      action.confirmed_at = confirmationIso(confirmationSnapshot, fallbackIso);
      action.confirmation_snapshot_id = confirmationSnapshot.snapshot_id || null;
      action.confirmation_snapshot_date = confirmationSnapshot.snapshot_date || null;
      confirmed[action.type] += 1;
      confirmed.total += 1;
    }

    return confirmed;
  }

  function actionStats(sourceState) {
    const actions = ensureActions(sourceState);
    return {
      pendingUnfollow: actions.filter(a => a.type === "unfollow" && a.status === "pending").length,
      pendingRemoveFollower: actions.filter(a => a.type === "remove_follower" && a.status === "pending").length,
      confirmedUnfollow: actions.filter(a => a.type === "unfollow" && a.status === "confirmed").length,
      confirmedRemoveFollower: actions.filter(a => a.type === "remove_follower" && a.status === "confirmed").length
    };
  }


  function buildSessionDiff(baselineState, currentState) {
    const baselineAccounts = baselineState?.accounts || {};
    const currentAccounts = currentState?.accounts || {};
    const allAccountKeys = new Set([
      ...Object.keys(baselineAccounts).map(usernameKey),
      ...Object.keys(currentAccounts).map(usernameKey)
    ]);

    const byUsername = new Map();
    const counts = {
      reviewed: 0,
      sentBackToReview: 0,
      tagsAdded: 0,
      tagsRemoved: 0,
      pendingUnfollow: 0,
      pendingRemoveFollower: 0,
      actionsCancelled: 0,
      unavailableMarked: 0,
      unavailableCleared: 0,
      notesEdited: 0,
      lastReviewedUpdated: 0
    };
    const tagAddedCounts = new Map();
    const tagRemovedCounts = new Map();

    function ensureEntry(username) {
      const key = usernameKey(username);
      if (!byUsername.has(key)) {
        byUsername.set(key, {
          username: username || key,
          changes: []
        });
      }
      return byUsername.get(key);
    }

    function addChange(username, change) {
      ensureEntry(username).changes.push(change);
    }

    for (const key of allAccountKeys) {
      const beforeAccount = baselineAccounts[key];
      const afterAccount = currentAccounts[key];
      if (!beforeAccount && !afterAccount) continue;

      const username = afterAccount?.username || beforeAccount?.username || key;
      const beforeReview = beforeAccount ? ensureReview(clone(beforeAccount)) : createReview();
      const afterReview = afterAccount ? ensureReview(clone(afterAccount)) : createReview();

      if (beforeReview.reviewed !== afterReview.reviewed) {
        if (afterReview.reviewed) {
          counts.reviewed += 1;
          addChange(username, { category: "reviews", type: "reviewed", label: "Marked reviewed" });
        } else {
          counts.sentBackToReview += 1;
          addChange(username, { category: "reviews", type: "unreviewed", label: "Sent back to review" });
        }
      }

      if (beforeReview.deleted_or_unavailable !== afterReview.deleted_or_unavailable) {
        if (afterReview.deleted_or_unavailable) {
          counts.unavailableMarked += 1;
          addChange(username, { category: "other", type: "unavailable_marked", label: "Marked unavailable" });
        } else {
          counts.unavailableCleared += 1;
          addChange(username, { category: "other", type: "unavailable_cleared", label: "Cleared unavailable" });
        }
      }

      const beforeTags = new Set(beforeReview.tags || []);
      const afterTags = new Set(afterReview.tags || []);
      for (const tag of afterTags) {
        if (beforeTags.has(tag)) continue;
        counts.tagsAdded += 1;
        tagAddedCounts.set(tag, (tagAddedCounts.get(tag) || 0) + 1);
        addChange(username, { category: "tags", type: "tag_added", label: `Added tag ${tag}`, tag });
      }
      for (const tag of beforeTags) {
        if (afterTags.has(tag)) continue;
        counts.tagsRemoved += 1;
        tagRemovedCounts.set(tag, (tagRemovedCounts.get(tag) || 0) + 1);
        addChange(username, { category: "tags", type: "tag_removed", label: `Removed tag ${tag}`, tag });
      }

      if (beforeReview.notes !== afterReview.notes) {
        counts.notesEdited += 1;
        addChange(username, { category: "other", type: "note_edited", label: "Edited note" });
      }

      if (beforeReview.reviewed === afterReview.reviewed && beforeReview.last_reviewed_at !== afterReview.last_reviewed_at) {
        counts.lastReviewedUpdated += 1;
        addChange(username, { category: "other", type: "last_reviewed_updated", label: "Updated last reviewed date" });
      }
    }

    const baselineActions = new Map((baselineState?.actions || []).map(action => [action.action_id, action]));
    const currentActions = currentState?.actions || [];

    for (const action of currentActions) {
      if (!ACTION_TYPES.includes(action.type)) continue;
      const before = baselineActions.get(action.action_id);
      const username = action.username;
      const actionName = action.type === "unfollow" ? "unfollow" : "follower removal";

      if (!before) {
        if (action.status === "pending") {
          if (action.type === "unfollow") counts.pendingUnfollow += 1;
          else counts.pendingRemoveFollower += 1;
          addChange(username, {
            category: "actions",
            type: action.type === "unfollow" ? "unfollow_pending" : "remove_follower_pending",
            label: action.type === "unfollow" ? "Marked Unfollowed now" : "Marked Remove follower"
          });
        } else if (action.status === "cancelled") {
          counts.actionsCancelled += 1;
          addChange(username, { category: "actions", type: "action_cancelled", label: `Cancelled ${actionName}` });
        }
        continue;
      }

      if (before.status === action.status) continue;
      if (action.status === "cancelled") {
        counts.actionsCancelled += 1;
        addChange(username, { category: "actions", type: "action_cancelled", label: `Cancelled ${actionName}` });
      } else if (action.status === "pending") {
        if (action.type === "unfollow") counts.pendingUnfollow += 1;
        else counts.pendingRemoveFollower += 1;
        addChange(username, {
          category: "actions",
          type: action.type === "unfollow" ? "unfollow_pending" : "remove_follower_pending",
          label: action.type === "unfollow" ? "Marked Unfollowed now" : "Marked Remove follower"
        });
      }
    }

    const accounts = [...byUsername.values()]
      .filter(entry => entry.changes.length)
      .sort((a, b) => String(a.username).localeCompare(String(b.username)));

    const tagsAdded = [...tagAddedCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
    const tagsRemoved = [...tagRemovedCounts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));

    const reviewChanges = counts.reviewed + counts.sentBackToReview;
    const tagChanges = counts.tagsAdded + counts.tagsRemoved;
    const actionChanges = counts.pendingUnfollow + counts.pendingRemoveFollower + counts.actionsCancelled;
    const otherChanges = counts.unavailableMarked + counts.unavailableCleared + counts.notesEdited + counts.lastReviewedUpdated;

    return {
      accounts,
      changedAccounts: accounts.length,
      changeCount: reviewChanges + tagChanges + actionChanges + otherChanges,
      counts,
      summary: {
        reviews: reviewChanges,
        tags: tagChanges,
        actions: actionChanges,
        other: otherChanges
      },
      tagsAdded,
      tagsRemoved
    };
  }

  function normalizeMaster(oldMaster) {
    const next = clone(oldMaster || {});
    let changed = false;

    if (next.schema_version !== SCHEMA_VERSION) {
      next.schema_version = SCHEMA_VERSION;
      changed = true;
    }

    if (JSON.stringify(next.status_semantics || {}) !== JSON.stringify(STATUS_SEMANTICS)) {
      next.status_semantics = clone(STATUS_SEMANTICS);
      changed = true;
    }

    if (!next.purpose) {
      next.purpose = "Instagram following/follower review tracker";
      changed = true;
    }
    if (!next.accounts || typeof next.accounts !== "object") {
      next.accounts = {};
      changed = true;
    }
    if (!Array.isArray(next.snapshots)) {
      next.snapshots = [];
      changed = true;
    }
    if (!Array.isArray(next.actions)) {
      next.actions = [];
      changed = true;
    }
    if (!Array.isArray(next.tag_options)) {
      next.tag_options = clone(DEFAULT_TAG_OPTIONS);
      changed = true;
    }

    if (Array.isArray(next.review_history)) {
      if (!Array.isArray(next.legacy_review_history)) next.legacy_review_history = clone(next.review_history);
      delete next.review_history;
      changed = true;
    }

    const normalizedAccounts = {};
    for (const [rawKey, account] of Object.entries(next.accounts)) {
      const key = usernameKey(account?.username || rawKey);
      if (!key) {
        changed = true;
        continue;
      }
      if (rawKey !== key || normalizedAccounts[key]) changed = true;
      if (!normalizedAccounts[key]) normalizedAccounts[key] = account;
    }
    next.accounts = normalizedAccounts;

    next.snapshots.forEach((snapshot, index) => {
      if (!snapshot.snapshot_id) {
        snapshot.snapshot_id = `legacy_snapshot_${index + 1}`;
        changed = true;
      }
      if (!("captured_at" in snapshot)) {
        snapshot.captured_at = null;
        changed = true;
      }
      if (!Array.isArray(snapshot.source_files)) {
        snapshot.source_files = [];
        changed = true;
      }
    });

    // Normalize existing action history first so legacy review flags can safely create pending actions.
    next.actions.forEach((action, index) => {
      const before = JSON.stringify(action);
      normalizeAction(next, action, index);
      if (JSON.stringify(action) !== before) changed = true;
    });

    const discoveredTags = new Set(next.tag_options.filter(tag => typeof tag === "string" && tag.trim()).map(tag => tag.trim()));

    for (const account of Object.values(next.accounts)) {
      const rawReview = account.review && typeof account.review === "object" ? account.review : {};
      const legacyPendingUnfollow = !!(rawReview.manual_unfollowed_now || rawReview.manually_unfollowed);
      const legacyMarkedAt = rawReview.manual_unfollowed_marked_at || null;
      const before = JSON.stringify(rawReview);

      const migratedReview = {
        reviewed: !!rawReview.reviewed,
        last_reviewed_at: rawReview.last_reviewed_at || null,
        deleted_or_unavailable: !!rawReview.deleted_or_unavailable,
        tags: Array.isArray(rawReview.tags) ? rawReview.tags : [],
        notes: typeof rawReview.notes === "string" ? rawReview.notes : ""
      };
      account.review = migratedReview;
      ensureReview(account);
      account.review.tags.forEach(tag => discoveredTags.add(tag));

      if (legacyPendingUnfollow && !pendingAction(next, account.username, "unfollow")) {
        const migratedAction = addPendingAction(next, account, "unfollow", legacyMarkedAt, { skipEligibility: true });
        migratedAction.relationship_at_mark = null;
        changed = true;
      }

      if (JSON.stringify(account.review) !== before) changed = true;
    }

    const normalizedTags = [...discoveredTags];
    if (JSON.stringify(normalizedTags) !== JSON.stringify(next.tag_options)) {
      next.tag_options = normalizedTags;
      changed = true;
    }

    return { next, changed };
  }

  return {
    SCHEMA_VERSION,
    STATUS_SEMANTICS,
    DEFAULT_TAG_OPTIONS,
    ACTION_TYPES,
    REVIEW_SCOPES,
    clone,
    usernameKey,
    createReview,
    ensureReview,
    markReviewed,
    parseFollowingJson,
    parseFollowersJson,
    dedupeAccounts,
    sameUsernameSet,
    syncCurrentRelationship,
    scopeMatches,
    tagMatches,
    reviewStatusMatches,
    reviewScopeAccounts,
    resetReviewedForScope,
    relationshipStats,
    reviewScopeStats,
    ensureActions,
    pendingAction,
    addPendingAction,
    cancelPendingAction,
    confirmPendingActions,
    actionStats,
    buildSessionDiff,
    normalizeMaster
  };
});
