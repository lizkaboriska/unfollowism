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

/** What the latest import revealed about this account's follow of you. */
export const FOLLOWER_CHANGES = { NEW: "new", LOST: "lost" } as const;
export type FollowerChange = (typeof FOLLOWER_CHANGES)[keyof typeof FOLLOWER_CHANGES];

export interface Account {
  username: string;
  review: Review;
  current: CurrentRelationship;
  actions: AccountActions;
  /** Set by the latest import when they started or stopped following you; absent otherwise. */
  follower_change?: FollowerChange;
}

/** What changed between two imports. Computed during an import; only new/lost followers are kept (on the accounts). */
export interface FollowChanges {
  newly_following: string[];
  stopped_following: string[];
  new_followers: string[];
  lost_followers: string[];
}

/** The working master in memory. See masterFile.ts for the compact saved form. */
export interface Master {
  version: typeof FORMAT_VERSION;
  tag_options: string[];
  /** Keyed by lower-cased username (see usernameKey). */
  accounts: Record<string, Account>;
  /** When the latest Instagram export was imported. */
  last_import_at: string;
  /** Set when the master is downloaded. */
  last_saved_at?: string;
}

/** One account parsed from an Instagram export file. */
export interface ParsedAccount {
  username: string;
  /** Instagram "since" time in seconds; null if the export gave none. */
  timestamp: number | null;
}

export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
