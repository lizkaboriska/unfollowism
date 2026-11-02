import { IMPORT_WARNINGS, type ImportWarning, type RecognizedFiles } from '../io/analyzeImport.ts';

import { formatDateTime } from './dates.ts';
import { plural } from './statusText.ts';

/**
 * One line saying what the chosen files contain, e.g. "Following ✓ · Followers ✓ (1 file) · Master: none — a new one
 * will be started".
 * `lastKnownSavedAt` (last save from this browser) turns a missing master into a hint to add it.
 */
export function recognizedText(
  { followingCount, followerFileCount, master }: RecognizedFiles,
  lastKnownSavedAt: string | null,
): string {
  const followingPart = `Following ${followingCount === null ? '✗' : '✓'}`;
  const followersPart = followerFileCount ? `Followers ✓ (${plural(followerFileCount, 'file')})` : 'Followers ✗';
  const masterPart = master
    ? `Master: ${master.name}${master.savedAt ? ` (saved ${formatDateTime(master.savedAt)})` : ''}`
    : lastKnownSavedAt
      ? `Master: none — add the one you saved on ${formatDateTime(lastKnownSavedAt)}, or a new one will be started`
      : 'Master: none — a new one will be started';
  return [followingPart, followersPart, masterPart].join(' · ');
}

/** What to add when the selection can't be imported yet. Null when nothing is missing. */
export function missingText({ followingCount, followerFileCount }: RecognizedFiles): string | null {
  const hasFollowing = followingCount !== null;
  if (!hasFollowing && !followerFileCount) {
    return (
      'No followers/following files found. Choose the .zip from Instagram (JSON format), ' +
      'or the following.json and followers_*.json files from it.'
    );
  }
  if (!hasFollowing) {
    return 'following.json is missing. Add it with Choose files or drop it here.';
  }
  if (!followerFileCount) {
    return 'followers_1.json (and any followers_2.json, …) is missing. Add them with Choose files or drop them here.';
  }
  return null;
}

/** Shown while choosing files, for a master that has been added. */
export function olderMasterText(
  warning: ImportWarning & { kind: typeof IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE },
): string {
  const savedOn = formatDateTime(warning.lastKnownSavedAt);
  return (
    `The chosen master is older than the one you saved from this browser on ${savedOn}. ` +
    'Recent review work may be missing from it.'
  );
}

/** Asked on Import, not while choosing: the master may simply not have been added yet. */
export function noMasterConfirmText(lastKnownSavedAt: string): string {
  return `You saved one on ${formatDateTime(lastKnownSavedAt)}. Without it your review history starts from scratch.`;
}
