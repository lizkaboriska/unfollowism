import { isRecord } from './checks.ts';

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
