/** The value type of a constant object, e.g. ValueOf<typeof ACTION_TYPES> = "unfollow" | "removeFollower". */
export type ValueOf<T> = T[keyof T];
