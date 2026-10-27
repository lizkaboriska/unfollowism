export const SCHEMA_VERSION = 6;

export const STATUS_SEMANTICS = {
  reviewed: "Whether the account currently needs another personal review. Resetting this flag does not erase tags, notes, actions, or last_reviewed_at.",
  last_reviewed_at: "The most recent known time you marked the account reviewed. It remains when reviewed is reset to false.",
  deleted_or_unavailable: "Your account-level flag that the Instagram account appears deleted, disabled, or otherwise unavailable.",
  tags: "Persistent account metadata used to build focused review scopes. Tags do not reset with review state.",
  actions: "Things you manually did on Instagram. Pending actions are confirmed only by a later imported relationship snapshot.",
  action_unfollow: "You stopped following the account. Confirmation requires the account to disappear from Following.",
  action_remove_follower: "You removed the account from your followers. Confirmation requires the account to disappear from Followers.",
} as const;

export type StatusSemantics = Record<keyof typeof STATUS_SEMANTICS, string>;

export const DEFAULT_TAG_OPTIONS: readonly string[] = ["artist", "fashion", "lifestyle", "aesthetics", "acquaintance", "home", "dog"];

export const ACTION_TYPES = ["unfollow", "remove_follower"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const ACTION_STATUSES = ["pending", "cancelled", "confirmed"] as const;
export type ActionStatus = (typeof ACTION_STATUSES)[number];

export const REVIEW_SCOPES = ["following", "followers", "mutual", "not_following_back", "follows_you_only", "all_current", "all_accounts"] as const;
export type ReviewScope = (typeof REVIEW_SCOPES)[number];

export type ReviewStatusFilter = "all" | "needs_review" | "reviewed";

// A user tag may be any string (even "untagged"), so the filter is structured rather than a sentinel string.
export type TagFilter = { kind: "all" } | { kind: "untagged" } | { kind: "tag"; tag: string };

export type Relationship = "mutual" | "not_following_back" | "follows_you_only" | "neither";

export interface Review {
  reviewed: boolean;
  last_reviewed_at: string | null;
  deleted_or_unavailable: boolean;
  tags: string[];
  notes: string;
}

export interface CurrentRelationship {
  you_follow: boolean;
  follows_you: boolean;
  relationship: Relationship;
  following_since_timestamp: number | null;
  follower_since_timestamp: number | null;
}

export interface Account {
  username: string;
  url: string;
  review: Review;
  current: CurrentRelationship;
}

export interface SnapshotChanges {
  newly_following: string[];
  stopped_following: string[];
  new_followers: string[];
  lost_followers: string[];
}

export interface SnapshotCounts {
  following: number;
  followers: number;
  mutual: number;
  not_following_back: number;
  followers_you_do_not_follow: number;
}

export interface Snapshot {
  snapshot_id: string;
  snapshot_date?: string | null;
  captured_at: string | null;
  source_files: string[];
  /** Username (original casing) → Instagram "since" timestamp in seconds. */
  following: Record<string, number | null>;
  followers: Record<string, number | null>;
  counts?: SnapshotCounts;
  /** Absent on the very first snapshot. */
  changes_from_previous_snapshot?: Partial<SnapshotChanges>;
}

export interface Action {
  action_id: string;
  username: string;
  type: ActionType;
  status: ActionStatus;
  marked_at: string | null;
  confirmed_at: string | null;
  cancelled_at: string | null;
  confirmation_snapshot_id: string | null;
  confirmation_snapshot_date: string | null;
  /** null for actions migrated from legacy review flags. */
  relationship_at_mark: { you_follow: boolean; follows_you: boolean } | null;
}

/**
 * The persisted master document (schema v6).
 * Objects keep any unknown fields they were loaded with, so saving never drops data
 * written by older or newer versions; only the fields below are relied upon.
 */
export interface Master {
  schema_version: typeof SCHEMA_VERSION;
  purpose: string;
  status_semantics: StatusSemantics;
  tag_options: string[];
  /** Keyed by lower-cased username (see usernameKey). */
  accounts: Record<string, Account>;
  snapshots: Snapshot[];
  actions: Action[];
  legacy_review_history?: unknown[];
  /** Actions with an unknown type or no username; preserved but ignored. */
  unrecognized_actions?: unknown[];
  last_saved_at?: string;
  last_updated_at?: string;
  exported_at?: string;
}

/** One account parsed from an Instagram export file. */
export interface ParsedAccount {
  username: string;
  url: string;
  timestamp: number | null;
}

export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
