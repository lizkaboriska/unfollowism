import { actionId, addPendingAction, pendingAction } from "./actions.ts";
import { normalizeReview } from "./review.ts";
import { computeCurrent } from "./scopes.ts";
import {
  ACTION_STATUSES,
  ACTION_TYPES,
  DEFAULT_TAG_OPTIONS,
  SCHEMA_VERSION,
  STATUS_SEMANTICS,
  type Account,
  type Action,
  type ActionStatus,
  type ActionType,
  type CurrentRelationship,
  type Master,
} from "./types.ts";
import { cloneJson, createDict, isRecord, numberOrNull, profileUrl, stringOrNull, usernameKey } from "./util.ts";

export interface NormalizeResult {
  next: Master;
  /** True when the master differs from what was loaded (migration happened) and should be saved. */
  changed: boolean;
}

export class MasterFormatError extends Error {
  override name = "MasterFormatError";
}

function isActionType(value: unknown): value is ActionType {
  return (ACTION_TYPES as readonly unknown[]).includes(value);
}

function isActionStatus(value: unknown): value is ActionStatus {
  return (ACTION_STATUSES as readonly unknown[]).includes(value);
}

/** Fills/coerces the action in place (key order preserved). Returns null if it can't be a valid action. */
function normalizeAction(action: Record<string, unknown>, usedIds: Set<string>, index: number): Action | null {
  if (action.type === "manual_unfollow") action.type = "unfollow";
  if (!isActionType(action.type) || typeof action.username !== "string") return null;

  if (!isActionStatus(action.status)) action.status = action.confirmed_at || action.confirmation_snapshot_id ? "confirmed" : "pending";
  for (const field of ["marked_at", "confirmed_at", "cancelled_at", "confirmation_snapshot_id", "confirmation_snapshot_date"] as const) {
    action[field] = stringOrNull(action[field]);
  }
  const rel = action.relationship_at_mark;
  action.relationship_at_mark = isRecord(rel) ? { you_follow: !!rel.you_follow, follows_you: !!rel.follows_you } : null;

  if (typeof action.action_id !== "string" || !action.action_id) {
    const fallback = `legacy_${index + 1}`;
    action.action_id = actionId(
      { actions: [...usedIds].map(id => ({ action_id: id }) as Action) },
      action.type,
      action.username || fallback,
      stringOrNull(action.marked_at) || stringOrNull(action.confirmed_at) || fallback,
    );
  }
  usedIds.add(action.action_id as string);
  return action as unknown as Action;
}

function normalizeCurrent(raw: unknown): CurrentRelationship {
  const c = isRecord(raw) ? raw : {};
  const base = computeCurrent(
    c.you_follow ? { timestamp: numberOrNull(c.following_since_timestamp) } : null,
    c.follows_you ? { timestamp: numberOrNull(c.follower_since_timestamp) } : null,
  );
  return { ...c, ...base };
}

/**
 * REPAIR + MIGRATE: the single entry point for any master coming from outside
 * (file import, browser storage). Accepts schema v3–v6 and returns a fresh v6 master.
 * After this, every account has a valid `review` and `current`.
 */
export function normalizeMaster(raw: unknown): NormalizeResult {
  if (!isRecord(raw)) throw new MasterFormatError("The master file is not a JSON object.");
  if (!isRecord(raw.accounts)) throw new MasterFormatError("The master file has no accounts object.");

  const next = cloneJson(raw);
  let changed = false;

  if (next.schema_version !== SCHEMA_VERSION) {
    next.schema_version = SCHEMA_VERSION;
    changed = true;
  }
  if (JSON.stringify(next.status_semantics ?? {}) !== JSON.stringify(STATUS_SEMANTICS)) {
    next.status_semantics = cloneJson(STATUS_SEMANTICS);
    changed = true;
  }
  if (typeof next.purpose !== "string" || !next.purpose) {
    next.purpose = "Instagram following/follower review tracker";
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
    next.tag_options = [...DEFAULT_TAG_OPTIONS];
    changed = true;
  }
  if (Array.isArray(next.review_history)) {
    if (!Array.isArray(next.legacy_review_history)) next.legacy_review_history = cloneJson(next.review_history);
    delete next.review_history;
    changed = true;
  }

  // Accounts: re-key by lower-cased username; first occurrence wins.
  const accounts = createDict<Account>();
  for (const [rawKey, rawAccount] of Object.entries(next.accounts as Record<string, unknown>)) {
    const accountRecord = isRecord(rawAccount) ? rawAccount : {};
    const username = typeof accountRecord.username === "string" && accountRecord.username ? accountRecord.username : rawKey;
    const key = usernameKey(username);
    if (!key) {
      changed = true;
      continue;
    }
    const duplicate = Object.hasOwn(accounts, key);
    if (rawKey !== key || duplicate) changed = true;
    if (duplicate) continue;
    accounts[key] = {
      ...accountRecord,
      username,
      url: typeof accountRecord.url === "string" && accountRecord.url ? accountRecord.url : profileUrl(username),
      review: accountRecord.review as Account["review"], // replaced below
      current: normalizeCurrent(accountRecord.current),
    };
  }
  next.accounts = accounts;

  for (const [index, snapshot] of (next.snapshots as unknown[]).entries()) {
    if (!isRecord(snapshot)) continue;
    if (typeof snapshot.snapshot_id !== "string" || !snapshot.snapshot_id) {
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
    if (!isRecord(snapshot.following)) snapshot.following = {};
    if (!isRecord(snapshot.followers)) snapshot.followers = {};
  }
  next.snapshots = (next.snapshots as unknown[]).filter(isRecord);

  // Actions first, so legacy review flags below can safely add pending actions.
  const rawActions = next.actions as unknown[];
  const usedIds = new Set(rawActions.filter(isRecord).map(a => a.action_id).filter((id): id is string => typeof id === "string" && !!id));
  const actions: Action[] = [];
  const unrecognized: unknown[] = Array.isArray(next.unrecognized_actions) ? next.unrecognized_actions : [];
  for (const [index, rawAction] of rawActions.entries()) {
    const before = JSON.stringify(rawAction);
    const action = isRecord(rawAction) ? normalizeAction(rawAction, usedIds, index) : null;
    if (action) {
      actions.push(action);
      if (JSON.stringify(action) !== before) changed = true;
    } else {
      unrecognized.push(rawAction);
      changed = true;
    }
  }
  next.actions = actions;
  if (unrecognized.length) next.unrecognized_actions = unrecognized;

  const master = next as unknown as Master;
  const discoveredTags = new Set((next.tag_options as unknown[]).filter((tag): tag is string => typeof tag === "string" && tag.trim() !== "").map(tag => tag.trim()));

  for (const account of Object.values(master.accounts)) {
    const rawReview: unknown = account.review;
    const reviewRecord = isRecord(rawReview) ? rawReview : {};
    const legacyPendingUnfollow = !!(reviewRecord.manual_unfollowed_now || reviewRecord.manually_unfollowed);
    const legacyMarkedAt = stringOrNull(reviewRecord.manual_unfollowed_marked_at) || null;
    const before = JSON.stringify(reviewRecord);

    account.review = normalizeReview(reviewRecord);
    for (const tag of account.review.tags) discoveredTags.add(tag);

    if (legacyPendingUnfollow && !pendingAction(master, account.username, "unfollow")) {
      const migrated = addPendingAction(master, account, "unfollow", legacyMarkedAt, { skipEligibility: true });
      migrated.relationship_at_mark = null;
      changed = true;
    }

    if (JSON.stringify(account.review) !== before) changed = true;
  }

  const tagOptions = [...discoveredTags];
  if (JSON.stringify(tagOptions) !== JSON.stringify(next.tag_options)) {
    master.tag_options = tagOptions;
    changed = true;
  }

  return { next: master, changed };
}
