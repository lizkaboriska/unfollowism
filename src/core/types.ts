/** Version of the saved master file format. Bump it (and handle the old value) when the format changes. */
export const FORMAT_VERSION = 1;

/** Tag choices for a brand-new master (the UI has no tag management yet). */
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
  /** YYYY-MM-DD (UTC). */
  snapshot_date: string;
  /** Exact capture time, or null when only the date is known. */
  captured_at: string | null;
  source_files: string[];
  /** Username (original casing) → Instagram "since" timestamp in seconds. */
  following: Record<string, number | null>;
  followers: Record<string, number | null>;
  counts: SnapshotCounts;
  /** Absent on the very first snapshot. */
  changes_from_previous_snapshot?: SnapshotChanges;
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
  /** Relationship when the action was marked, or null when unknown. */
  relationship_at_mark: { you_follow: boolean; follows_you: boolean } | null;
}

/** The saved master file. Only these fields are saved; see parseMaster. */
export interface Master {
  version: typeof FORMAT_VERSION;
  tag_options: string[];
  /** Keyed by lower-cased username (see usernameKey). */
  accounts: Record<string, Account>;
  snapshots: Snapshot[];
  actions: Action[];
  /** Set when the master is downloaded. */
  last_saved_at?: string;
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
