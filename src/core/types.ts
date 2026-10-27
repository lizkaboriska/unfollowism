/** Version of the saved master file format. Bump it (and handle the old value) when the format changes. */
export const FORMAT_VERSION = 1;

/** Tag choices for a brand-new master (the UI has no tag management yet). */
export const DEFAULT_TAG_OPTIONS: readonly string[] = ["artist", "fashion", "lifestyle", "aesthetics", "acquaintance", "home", "dog"];

export const ACTION_TYPES = ["unfollow", "remove_follower"] as const;
export type ActionType = (typeof ACTION_TYPES)[number];

export const REVIEW_SCOPES = ["following", "followers", "mutual", "not_following_back", "follows_you_only", "all_current", "all_accounts"] as const;
export type ReviewScope = (typeof REVIEW_SCOPES)[number];

export type ReviewStatusFilter = "all" | "needs_review" | "reviewed";

// A user tag may be any string (even "untagged"), so the filter is structured rather than a sentinel string.
export type TagFilter = { kind: "all" } | { kind: "untagged" } | { kind: "tag"; tag: string };

export type Relationship = "mutual" | "not_following_back" | "follows_you_only" | "neither";

export interface Review {
  /** Whether the account currently counts as reviewed. Resetting it keeps everything else. */
  reviewed: boolean;
  /** When you last marked it reviewed; null = never reviewed. Kept when `reviewed` is reset. */
  last_reviewed_at: string | null;
  deleted_or_unavailable: boolean;
  tags: string[];
  notes: string;
}

export interface CurrentRelationship {
  you_follow: boolean;
  follows_you: boolean;
  relationship: Relationship;
  /** Instagram "since" time in seconds; null when you don't follow them (or the export gave no time). */
  following_since_timestamp: number | null;
  /** Same for their follow of you. */
  follower_since_timestamp: number | null;
}

/** Instagram actions you did by hand. Each type appears at most once per list. */
export interface AccountActions {
  /** Marked in the app, not yet seen in an imported export. */
  pending: ActionType[];
  /** Seen in an imported export: you did this at some point. */
  confirmed: ActionType[];
}

export interface Account {
  username: string;
  url: string;
  review: Review;
  current: CurrentRelationship;
  actions: AccountActions;
}

export interface SnapshotChanges {
  newly_following: string[];
  stopped_following: string[];
  new_followers: string[];
  lost_followers: string[];
}

/** The follow graph as of one import. A new snapshot is stored only when it differs from the previous one. */
export interface Snapshot {
  captured_at: string;
  /** Usernames (original casing). */
  following: string[];
  followers: string[];
  /** Absent on the very first snapshot. */
  changes?: SnapshotChanges;
}

/** The saved master file. Only these fields are saved; see parseMaster. */
export interface Master {
  version: typeof FORMAT_VERSION;
  tag_options: string[];
  /** Keyed by lower-cased username (see usernameKey). */
  accounts: Record<string, Account>;
  snapshots: Snapshot[];
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
