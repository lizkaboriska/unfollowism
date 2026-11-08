import { FIELD_TYPES, IMPORT_PROBLEMS, type FieldType, type ImportProblem } from '@/entities/master';

const EXPECTED: Record<Exclude<FieldType, typeof FIELD_TYPES.ONE_OF>, string> = {
  [FIELD_TYPES.OBJECT]: 'an object',
  [FIELD_TYPES.NON_EMPTY_OBJECT]: 'an object with at least one entry',
  [FIELD_TYPES.LIST]: 'a list',
  [FIELD_TYPES.TEXT]: 'text',
  [FIELD_TYPES.NON_EMPTY_TEXT]: 'non-empty text',
  [FIELD_TYPES.BOOLEAN]: 'true or false',
  [FIELD_TYPES.NUMBER_OR_NULL]: 'a number or null',
  [FIELD_TYPES.WHOLE_NUMBER]: 'a whole number',
  [FIELD_TYPES.DATE]: 'a date',
};

const SINGLE_EXPORT = 'Choose files from a single Instagram export.';

/** Why the chosen files can't be imported, as shown on the import screen. */
export function importProblemText(problem: ImportProblem): string {
  switch (problem.kind) {
    case IMPORT_PROBLEMS.SEVERAL_FOLLOWING_FILES:
      return `Found more than one Following file (${problem.paths[0]} and ${problem.paths[1]}). ${SINGLE_EXPORT}`;
    case IMPORT_PROBLEMS.DUPLICATE_FOLLOWER_FILE:
      return `Found ${problem.name} twice. ${SINGLE_EXPORT}`;
    case IMPORT_PROBLEMS.SEVERAL_MASTERS:
      return `Found ${problem.names.length} progress files (${problem.names.join(', ')}). Choose only the newest one.`;
    case IMPORT_PROBLEMS.HTML_EXPORT:
      return (
        'This export is in HTML format. In Instagram, request “Export your information” again ' +
        '(called Download your information in some versions) and choose the JSON format.'
      );
    case IMPORT_PROBLEMS.NO_FOLLOWING:
      return 'No accounts found in the Following file of this export.';
    case IMPORT_PROBLEMS.NO_FOLLOWERS:
      return 'No accounts found in the Followers files of this export.';
    case IMPORT_PROBLEMS.NOT_A_MASTER:
      return 'This file is not an Unfollowism progress file.';
    case IMPORT_PROBLEMS.INCOMPATIBLE_VERSION:
      return "This file wasn't saved by a compatible version of Unfollowism.";
    case IMPORT_PROBLEMS.INVALID_FIELD: {
      const expected =
        problem.expected === FIELD_TYPES.ONE_OF ? `one of ${problem.options.join(', ')}` : EXPECTED[problem.expected];
      return `Invalid progress file: ${problem.path} should be ${expected}.`;
    }
    case IMPORT_PROBLEMS.UNKNOWN_FIELD:
      return `Invalid progress file: ${problem.path} is not a known field.`;
    case IMPORT_PROBLEMS.DUPLICATE_ACCOUNT:
      return `Invalid progress file: account "${problem.username}" appears twice.`;
  }
}
