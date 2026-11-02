import { IMPORT_WARNINGS, type ImportWarning, type RecognizedFiles } from '../io/analyzeImport.ts';

import { formatDate, formatDateTime } from './dates.ts';
import { plural } from './statusText.ts';

/** What's missing before the selection can be imported, as a warning. Null when nothing is. */
export function missingWarning({
  followingCount,
  followerFileCount,
}: RecognizedFiles): { title: string; body: string } | null {
  const hasFollowing = followingCount !== null;
  if (!hasFollowing && !followerFileCount) {
    return {
      title: 'No Instagram files found',
      body: 'Choose the .zip from Instagram (JSON format), or the following.json and followers_*.json files from it.',
    };
  }
  const downloadAgain = 'or download your Instagram data again with both Followers and Following, in JSON format.';
  if (!hasFollowing) {
    return {
      title: 'Followers found. Following is missing.',
      body: `Add following.json from the same export, ${downloadAgain}`,
    };
  }
  if (!followerFileCount) {
    return {
      title: 'Following found. Followers are missing.',
      body: `Add followers_1.json (and any followers_2.json, …) from the same export, ${downloadAgain}`,
    };
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

/** What the box needs to know about the export's files (everything chosen except the master). */
export interface ExportFileInfo {
  name: string;
  size: number;
  lastModified: number;
}

const megabytes = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'megabyte', maximumFractionDigits: 1 });
const kilobytes = new Intl.NumberFormat(undefined, { style: 'unit', unit: 'kilobyte', maximumFractionDigits: 0 });

function fileSize(bytes: number): string {
  return bytes >= 1_000_000 ? megabytes.format(bytes / 1_000_000) : kilobytes.format(Math.max(1, bytes / 1000));
}

/** "instagram.zip · 2.4 MB · Oct 29, 2026" for one file, "3 files" for loose files. */
export function exportFilesText(files: readonly ExportFileInfo[]): string {
  const [only] = files;
  if (files.length !== 1 || !only) {
    return plural(files.length, 'file');
  }
  return [only.name, fileSize(only.size), formatDate(new Date(only.lastModified).toISOString())].join(' · ');
}
