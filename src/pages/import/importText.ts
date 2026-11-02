import { IMPORT_WARNINGS, type ImportWarning, type RecognizedFiles } from '@/entities/master/lib/analyzeImport.ts';
import { plural } from '@/entities/master/ui/statusText.ts';
import { formatDate, formatDateTime } from '@/shared/lib/dates.ts';

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

/** "You downloaded a master on …": the warning when no master is chosen but this browser saved one before. */
export function savedMasterMissingText(lastKnownSavedAt: string): string {
  return (
    `You downloaded a master on ${formatDate(lastKnownSavedAt)}, but none is selected. ` +
    "Add it to bring back your past decisions. If you start fresh, they won't carry over."
  );
}

/**
 * The two dates the older-master warning compares, as shown. Saved on the same day, they get the time too.
 * `selected` is null for a master that doesn't say when it was saved.
 */
export function olderMasterDates({
  fileSavedAt,
  lastKnownSavedAt,
}: ImportWarning & { kind: typeof IMPORT_WARNINGS.MASTER_OLDER_THAN_LAST_SAVE }): {
  selected: string | null;
  lastSaved: string;
} {
  const sameDay = fileSavedAt !== null && formatDate(fileSavedAt) === formatDate(lastKnownSavedAt);
  const format = sameDay ? formatDateTime : formatDate;
  return { selected: fileSavedAt && format(fileSavedAt), lastSaved: format(lastKnownSavedAt) };
}

/** What the older master means, under its two dates. */
export function olderMasterText({ selected, lastSaved }: { selected: string | null; lastSaved: string }): string {
  const lost = selected
    ? `Decisions saved after ${selected} won't come back.`
    : "Some saved decisions won't come back.";
  return `${lost} Choose your ${lastSaved} master to keep them.`;
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
