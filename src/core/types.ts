/** The value type of a constant object, e.g. ValueOf<typeof ACTION_TYPES> = "unfollow" | "removeFollower". */
export type ValueOf<T> = T[keyof T];

/** Version of the saved master file format. Bump it (and handle the old value) when the format changes. */
export const FORMAT_VERSION = 1;

/** Tag choices for a brand-new master (the UI has no tag management yet). */
export const DEFAULT_TAG_OPTIONS: readonly string[] = ["artist", "fashion", "lifestyle", "aesthetics", "acquaintance", "home", "dog"];

/** Instagram actions you do by hand and mark in the app. */
export const ACTION_TYPES = { UNFOLLOW: "unfollow", REMOVE_FOLLOWER: "removeFollower" } as const;
export type ActionType = ValueOf<typeof ACTION_TYPES>;

/** Which accounts the review list covers. Scopes overlap: a mutual account is in "following" and "followers". */
export const REVIEW_SCOPES = {
  FOLLOWING: "following",
  FOLLOWERS: "followers",
  MUTUAL: "mutual",
  NOT_FOLLOWING_BACK: "notFollowingBack",
  FOLLOWS_YOU_ONLY: "followsYouOnly",
  ALL_CURRENT: "allCurrent",
  ALL_ACCOUNTS: "allAccounts",
} as const;
export type ReviewScope = ValueOf<typeof REVIEW_SCOPES>;

export const REVIEW_STATUSES = { ALL: "all", NEEDS_REVIEW: "needsReview", REVIEWED: "reviewed" } as const;
export type ReviewStatusFilter = ValueOf<typeof REVIEW_STATUSES>;

// A user tag may be any string (even "untagged"), so the filter is structured rather than a sentinel string.
export const TAG_FILTER_KINDS = { ALL: "all", UNTAGGED: "untagged", TAG: "tag" } as const;
export type TagFilter =
  | { kind: typeof TAG_FILTER_KINDS.ALL }
  | { kind: typeof TAG_FILTER_KINDS.UNTAGGED }
  | { kind: typeof TAG_FILTER_KINDS.TAG; tag: string };

export const RELATIONSHIPS = {
  MUTUAL: "mutual",
  NOT_FOLLOWING_BACK: "notFollowingBack",
  FOLLOWS_YOU_ONLY: "followsYouOnly",
  NEITHER: "neither",
} as const;
export type Relationship = ValueOf<typeof RELATIONSHIPS>;

/** A planned Instagram action: marked in the app, then "done" once you did it by hand. The next import checks it. */
export const PLAN_STATES = { PLANNED: "planned", DONE: "done" } as const;
export type PlanState = ValueOf<typeof PLAN_STATES>;

/**
 * What changed since the master you imported was saved (or everything, without a saved master).
 * Follows use Instagram's own dates; stopped follows use the date an import first noticed them.
 */
export const FOLLOW_CHANGES = {
  NEW_FOLLOWS: "newFollows",
  UNFOLLOWED: "unfollowed",
  NEW_FOLLOWERS: "newFollowers",
  LOST_FOLLOWERS: "lostFollowers",
} as const;
export type FollowChange = ValueOf<typeof FOLLOW_CHANGES>;

export interface Review {
  /** Whether the account currently counts as reviewed. Resetting it keeps everything else. */
  reviewed: boolean;
  /** When you last marked it reviewed; null = never reviewed. Kept when `reviewed` is reset. */
  lastReviewedAt: string | null;
  /** The account seems deleted, disabled or otherwise unavailable. */
  unavailable: boolean;
  tags: string[];
  notes: string;
}

/** A follow seen in the latest export. */
export interface Follow {
  /** Instagram "since" time in seconds; null when the export gave none. */
  since: number | null;
}

export interface Account {
  username: string;
  /** You follow them (as of the latest export); null when you don't. */
  following: Follow | null;
  /** They follow you (as of the latest export); null when they don't. */
  followedBy: Follow | null;
  review: Review;
  /** You plan to unfollow them; absent when not marked. Cleared by the import that no longer finds the follow. */
  toUnfollow?: PlanState;
  /** You plan to remove them as a follower; absent when not marked. Cleared like toUnfollow. */
  toRemove?: PlanState;
  /** When an import found you no longer follow them; absent while you do (or never did). */
  unfollowedSeenAt?: string;
  /** When an import found they no longer follow you; absent while they do (or never did). */
  unfollowedMeSeenAt?: string;
}

export type ReadonlyAccount = DeepReadonly<Account>;
export type ReadonlyAccounts = DeepReadonly<Record<string, Account>>;

/** The working master in memory. See masterFile.ts for the compact saved form. */
export interface Master {
  version: typeof FORMAT_VERSION;
  tagOptions: string[];
  /** Keyed by lower-cased username (see usernameKey). */
  accounts: Record<string, Account>;
  /** When the latest Instagram export was imported. */
  lastImportAt: string;
  /** Set when the master is downloaded. */
  lastSavedAt?: string;
}

/** One entry of an Instagram following/followers export file. */
export interface ExportEntry {
  username: string;
  /** Instagram "since" time in seconds; null if the export gave none. */
  since: number | null;
}

export type DeepReadonly<T> = T extends (infer U)[]
  ? readonly DeepReadonly<U>[]
  : T extends object
    ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
    : T;
