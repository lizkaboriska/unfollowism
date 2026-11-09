import type { ValueOf } from '@/shared/lib/valueOf.ts';

/** What a master file field should have been. */
export const FIELD_TYPES = {
  OBJECT: 'object',
  NON_EMPTY_OBJECT: 'nonEmptyObject',
  LIST: 'list',
  TEXT: 'text',
  NON_EMPTY_TEXT: 'nonEmptyText',
  BOOLEAN: 'boolean',
  NUMBER_OR_NULL: 'numberOrNull',
  WHOLE_NUMBER: 'wholeNumber',
  DATE: 'date',
  ONE_OF: 'oneOf',
} as const;
export type FieldType = ValueOf<typeof FIELD_TYPES>;

/** Why the chosen files can't be imported. Wording is up to the UI. */
export const IMPORT_PROBLEMS = {
  // The selection
  SEVERAL_FOLLOWING_FILES: 'severalFollowingFiles',
  DUPLICATE_FOLLOWER_FILE: 'duplicateFollowerFile',
  SEVERAL_MASTERS: 'severalMasters',
  HTML_EXPORT: 'htmlExport',
  // The export
  NO_FOLLOWING: 'noFollowing',
  NO_FOLLOWERS: 'noFollowers',
  // The master file
  NOT_A_MASTER: 'notAMaster',
  INCOMPATIBLE_VERSION: 'incompatibleVersion',
  INVALID_FIELD: 'invalidField',
  UNKNOWN_FIELD: 'unknownField',
  DUPLICATE_ACCOUNT: 'duplicateAccount',
} as const;

type P = typeof IMPORT_PROBLEMS;

export type ImportProblem =
  | { kind: P['SEVERAL_FOLLOWING_FILES']; paths: [string, string] }
  | { kind: P['DUPLICATE_FOLLOWER_FILE']; name: string }
  | { kind: P['SEVERAL_MASTERS']; names: string[] }
  | { kind: P['HTML_EXPORT'] | P['NO_FOLLOWING'] | P['NO_FOLLOWERS'] | P['NOT_A_MASTER'] | P['INCOMPATIBLE_VERSION'] }
  /** `path` names the field, e.g. "accounts.bob.review.tags". */
  | { kind: P['INVALID_FIELD']; path: string; expected: Exclude<FieldType, typeof FIELD_TYPES.ONE_OF> }
  | { kind: P['INVALID_FIELD']; path: string; expected: typeof FIELD_TYPES.ONE_OF; options: string[] }
  | { kind: P['UNKNOWN_FIELD']; path: string }
  | { kind: P['DUPLICATE_ACCOUNT']; username: string };

/** Thrown for files that can't be imported; `problem` says why. The message is only the problem's kind, for logs. */
export class ImportError extends Error {
  override name = 'ImportError';
  readonly problem: ImportProblem;

  constructor(problem: ImportProblem) {
    super(problem.kind);
    this.problem = problem;
  }
}
