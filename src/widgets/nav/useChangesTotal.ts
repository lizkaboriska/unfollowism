import { selectChangesSince, selectFollowChangeCounts } from '@/entities/master/model/selectors.ts';
import { useAppSelector } from '@/shared/lib/storeHooks.ts';

/** Everything on the Changes page; 0 without a saved master, when there is nothing to compare with. */
export function useChangesTotal(): number {
  const counts = useAppSelector(selectFollowChangeCounts);
  const since = useAppSelector(selectChangesSince);
  return since === null ? 0 : Object.values(counts).reduce((sum, n) => sum + n, 0);
}
