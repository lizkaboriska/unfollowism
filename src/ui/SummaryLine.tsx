import { Text } from "@chakra-ui/react";
import { ACTION_TYPES, PLAN_STATES } from "../core/index.ts";
import { LIST_VIEWS, isFollowChangeView } from "../store/filtersSlice.ts";
import { useAppSelector } from "../store/hooks.ts";
import { selectListKeys } from "../store/listSlice.ts";
import { selectChangesSince, selectPlanStats, selectScopeStats } from "../store/selectors.ts";
import { formatDate } from "./dates.ts";
import { CHANGE_SUMMARY_PHRASES, PLAN_LABELS, scopeDescription } from "./labels.ts";
import { plural } from "./statusText.ts";

/** One line describing what the current tab shows. */
export function SummaryLine() {
  const filters = useAppSelector(s => s.filters);
  const shown = useAppSelector(selectListKeys).length;
  const scopeStats = useAppSelector(selectScopeStats);
  const plans = useAppSelector(selectPlanStats);
  const since = useAppSelector(selectChangesSince);
  const { view } = filters;

  let text: string;
  if (view === LIST_VIEWS.REVIEW) {
    text = `${scopeStats.needsReview} need review · ${scopeStats.reviewed} reviewed · ${scopeStats.total} in ${scopeDescription(filters.scope, filters.tag)}`;
  } else if (isFollowChangeView(view)) {
    text = `${plural(shown, "account")} ${CHANGE_SUMMARY_PHRASES[view]} ${since ? `since your last save (${formatDate(since)})` : "since you started"}`;
  } else {
    const type = view === LIST_VIEWS.TO_UNFOLLOW ? ACTION_TYPES.UNFOLLOW : ACTION_TYPES.REMOVE_FOLLOWER;
    const done = plans[PLAN_STATES.DONE][type];
    text = `${plans[PLAN_STATES.PLANNED][type]} ${PLAN_LABELS[type].summary}${done ? ` · ${done} done, waiting for the next import` : ""}`;
  }
  return <Text color="fg.muted">{text}</Text>;
}
