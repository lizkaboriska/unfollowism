import { IMPORT_WARNINGS, type ImportWarning, type RecognizedFiles } from '@/entities/master';
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
      body: `Add following.json from the same .zip, ${downloadAgain}`,
    };
  }
  if (!followerFileCount) {
    return {
      title: 'Following found. Followers are missing.',
      body: `Add followers_1.json (and any followers_2.json, …) from the same .zip, ${downloadAgain}`,
    };
  }
  return null;
}

/** "You saved one on …": the warning when no progress file is chosen but this browser saved one before. */
export function savedMasterMissingText(lastKnownSavedAt: string): string {
  return (
    `You saved one on ${formatDate(lastKnownSavedAt)}, but none is selected. ` +
    "Add it to bring back your tags, notes, and choices. If you start fresh, they won't carry over."
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

/** What the older progress file means, under its two dates. */
export function olderMasterText({ selected, lastSaved }: { selected: string | null; lastSaved: string }): string {
  const lost = selected ? `Choices saved after ${selected} won't come back.` : "Some saved choices won't come back.";
  return `${lost} Choose your ${lastSaved} file to keep them.`;
}
