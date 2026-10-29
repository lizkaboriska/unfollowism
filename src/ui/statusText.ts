import {
  ACTION_TYPES,
  isRecord,
  type FollowChangeCounts,
  type ImportSummary,
  type PlanOutcomes,
} from '../core/index.ts';
import { STATUS_EVENTS, type StatusEvent } from '../store/statuses.ts';

/** The message of a caught error: a string, an Error, or the plain { message } object Redux Toolkit passes on. */
export function errorMessage(error: unknown): string {
  if (typeof error === 'string') {
    return error;
  }
  if (isRecord(error) && typeof error.message === 'string') {
    return error.message;
  }
  return 'Unexpected error';
}

export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

function changesText(c: FollowChangeCounts): string {
  return (
    `Since your last save: ${plural(c.newFollows, 'new follow')}, ${c.unfollowed} unfollowed, ` +
    `${plural(c.newFollowers, 'new follower')}, ${plural(c.lostFollowers, 'lost follower')}.`
  );
}

function plansText({ completed, reopened }: PlanOutcomes): string {
  const parts: string[] = [];
  if (completed[ACTION_TYPES.UNFOLLOW]) {
    parts.push(`${plural(completed[ACTION_TYPES.UNFOLLOW], 'planned unfollow')} done.`);
  }
  if (completed[ACTION_TYPES.REMOVE_FOLLOWER]) {
    parts.push(`${plural(completed[ACTION_TYPES.REMOVE_FOLLOWER], 'planned follower removal')} done.`);
  }
  if (reopened[ACTION_TYPES.UNFOLLOW]) {
    parts.push(
      `${plural(reopened[ACTION_TYPES.UNFOLLOW], 'account')} marked done but still followed: back in To unfollow.`,
    );
  }
  if (reopened[ACTION_TYPES.REMOVE_FOLLOWER]) {
    parts.push(
      `${plural(reopened[ACTION_TYPES.REMOVE_FOLLOWER], 'account')} marked done but still following you: ` +
        'back in To remove.',
    );
  }
  return parts.map(part => ` ${part}`).join('');
}

function importText(isNewMaster: boolean, followerFileCount: number, summary: ImportSummary): string {
  const files = plural(followerFileCount, 'follower file');
  const counts = `${summary.followingCount} following, ${summary.followersCount} followers.`;
  const details = `${changesText(summary.changes)}${plansText(summary.plans)}`;

  if (isNewMaster) {
    return `Started a new master from ${files}. ${counts} Save master to keep it.`;
  }
  if (summary.exportChanged) {
    return `New export loaded from ${files} — not saved yet. ${counts} ${details}`;
  }
  return `Loaded ${files}: same as the last import. ${counts} ${details}`;
}

/** Status-bar text for what last happened. */
export function statusText(status: StatusEvent | null): string {
  if (!status) {
    return '';
  }
  switch (status.type) {
    case STATUS_EVENTS.IMPORTED:
      return importText(status.isNewMaster, status.followerFileCount, status.summary);
    case STATUS_EVENTS.SAVED:
      return status.changedWhileSaving
        ? `Master saved as ${status.filename}. Changes made while saving are not in that file yet.`
        : `Master saved as ${status.filename}. Keep this file: import it next time.`;
    case STATUS_EVENTS.SAVE_FAILED:
      return `Could not save master: ${status.reason ?? 'unexpected error'}`;
  }
}
