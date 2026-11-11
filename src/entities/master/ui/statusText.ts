import { STATUS_EVENTS, type StatusEvent } from '../model/statuses.ts';

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
