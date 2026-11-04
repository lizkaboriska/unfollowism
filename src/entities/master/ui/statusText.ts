import { isRecord } from '@/shared/lib/checks.ts';

import { STATUS_EVENTS, type StatusEvent } from '../model/statuses.ts';

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

/** Status-line text: only a failed save says something (a save shows a toast instead). */
export function statusText(status: StatusEvent | null): string {
  if (!status) {
    return '';
  }
  switch (status.type) {
    case STATUS_EVENTS.SAVED:
      return '';
    case STATUS_EVENTS.SAVE_FAILED:
      return `Try Save again. Error: ${status.reason ?? 'unexpected error'}`;
  }
}
