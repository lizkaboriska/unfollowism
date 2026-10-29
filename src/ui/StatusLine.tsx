import { Text } from '@chakra-ui/react';

import { useAppSelector } from '../store/hooks.ts';

import { statusText } from './statusText.ts';

/** What last happened (import, save…). */
export function StatusLine() {
  const message = statusText(useAppSelector(s => s.master.status));
  return message ? <Text>{message}</Text> : null;
}
