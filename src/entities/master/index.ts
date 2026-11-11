// lib
export { type ChangedAccounts } from './lib/account.ts';
export { totalOf } from './lib/actions.ts';
export {
  analyzeImport,
  IMPORT_WARNINGS,
  type ImportSelection,
  type ImportWarning,
  type RecognizedFiles,
} from './lib/analyzeImport.ts';
export { decisionMatches, followExists, isKept, isPastAccount, planOf } from './lib/decision.ts';
export { FIELD_TYPES, type FieldType, IMPORT_PROBLEMS, ImportError, type ImportProblem } from './lib/importProblems.ts';
export { type RenamePair, RenameMatch, RenameState } from './lib/renames.ts';
export { queryMatches, relationshipOf, scopeMatches, tagMatches } from './lib/scopes.ts';
export {
  groupSessionChanges,
  SESSION_CHANGES,
  type SessionAccountChanges,
  type SessionChange,
  TagChangeKind,
  type TagChangeRow,
} from './lib/sessionDiff.ts';
export { findTag } from './lib/tags.ts';
export {
  ACTION_TYPES,
  type ActionType,
  type Decision,
  DecisionFilter,
  DecisionKind,
  type Follow,
  FOLLOW_CHANGES,
  type FollowChange,
  type ImportFacts,
  type Master,
  PLAN_STATES,
  type PlanState,
  type ReadonlyAccount,
  REVIEW_SCOPES,
  type ReviewScope,
  TAG_FILTER_KINDS,
  type TagFilter,
} from './lib/types.ts';
export { profileUrl, usernameKey } from './lib/util.ts';

// api
export { type LastSavedStore, localStorageLastSaved } from './api/lastSaved.ts';
export { createMemoryBackupStore, openIndexedDbBackupStore, type BackupStore } from './api/backupStore.ts';

// model
export {
  confirmRename,
  deleteTag,
  dismissRename,
  undoRename,
  keepInstead,
  masterSlice,
  persistenceFailed,
  renameTag,
  resetChanges,
  setNote,
  setPlan,
  setUnavailable,
  toggleTag,
} from './model/masterSlice.ts';
export {
  hasAccountChanges,
  hasNewData,
  sameKeys,
  selectAccount,
  selectAccountLookup,
  selectChangeSections,
  selectChangesSince,
  selectChangesTotal,
  selectHasBeenSaved,
  selectFollowChangeCounts,
  selectRenamePairs,
  selectHasProject,
  selectImportedAt,
  selectImportedUsername,
  selectIsDirty,
  selectIsSaving,
  selectWasPlanDoneBeforeImport,
  selectPlanStats,
  selectRelationshipStats,
  selectScopeTotals,
  type ScopeTotals,
  selectSortedKeys,
  selectTagCounts,
  selectTags,
  selectTodoStartView,
  selectUnsavedAccountCount,
  selectUnsavedDiff,
} from './model/selectors.ts';
export { IMPORT_STATUSES, SAVE_STATUSES, STATUS_EVENTS } from './model/statuses.ts';
export { importPrepared, restoreBackup, saveMaster } from './model/thunks.ts';
export { persistenceStopped, startPersistence } from './model/persistence.ts';
export { isPlanView, LIST_VIEWS, type ListView, PLAN_VIEW_ACTIONS, type PlanView, TODO_VIEWS } from './model/views.ts';

// ui
export { KeepButton, ReviewCard } from './ui/ReviewCard.tsx';
export { openProfilePopup } from './ui/instagramLink.ts';
export { ProfileLink } from './ui/ProfileLink.tsx';
export {
  CHANGE_SECTION_TITLES,
  COMPLETED_PLAN_BADGES,
  DECISION_FILTER_LABELS,
  planText,
  queueText,
  RELATIONSHIP_NOTES,
  relationshipNote,
  SCOPE_LABELS,
  tagFilterLabel,
  TODO_LABELS,
} from './ui/labels.ts';
export { errorMessage, plural, statusText } from './ui/statusText.ts';
