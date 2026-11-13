import { selectChangesSince, selectChangesTotal } from '@/entities/master';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

/** Everything on the Changes page; 0 on a first import, when there is nothing to compare with. */
export function useChangesTotal(): number {
  const total = useAppSelector(selectChangesTotal);
  const since = useAppSelector(selectChangesSince);
  return since === null ? 0 : total;
}
