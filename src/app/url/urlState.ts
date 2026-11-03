import {
  DecisionFilter,
  REVIEW_SCOPES,
  TAG_FILTER_KINDS,
  type ReviewScope,
  type TagFilter,
} from '@/entities/master/lib/index.ts';
import { LIST_VIEWS, type ListView } from '@/entities/master/model/views.ts';
import { NO_FILTERS, type FiltersState } from '@/features/filters';

// The page lives in the path; Review's list and filters in the search params, only on Review's path.
// Defaults are left out, so a plain Review is just "/". Values are kebab-case, as URLs usually are.

/** The path of each page. */
export enum UrlPath {
  REVIEW = '/',
  CHANGES = '/changes',
  TODO = '/todo',
  TODO_UNFOLLOW = '/todo/unfollow',
  TODO_REMOVE = '/todo/remove',
}

/** The search params, in the order they're written. */
export enum UrlParam {
  LIST = 'list',
  DECISION = 'decision',
  TAG = 'tag',
  QUERY = 'q',
}

/** `tag=none` is the No tags filter. A real tag named "none" or starting with "~" gets one "~" added in the URL. */
const NO_TAGS = 'none';
const TAG_ESCAPE = '~';

const VIEW_PATHS: Record<ListView, UrlPath> = {
  [LIST_VIEWS.REVIEW]: UrlPath.REVIEW,
  [LIST_VIEWS.CHANGES]: UrlPath.CHANGES,
  [LIST_VIEWS.TO_UNFOLLOW]: UrlPath.TODO_UNFOLLOW,
  [LIST_VIEWS.TO_REMOVE]: UrlPath.TODO_REMOVE,
};

/** What each path shows; null: To do without a tab. */
const PATH_VIEWS = new Map<string, ListView | null>([
  ...Object.entries(VIEW_PATHS).map(([view, path]) => [path, view as ListView] as const),
  [UrlPath.TODO, null],
]);

const SCOPE_VALUES: Record<ReviewScope, string> = {
  [REVIEW_SCOPES.FOLLOWING]: 'following',
  [REVIEW_SCOPES.FOLLOWERS]: 'followers',
  [REVIEW_SCOPES.MUTUAL]: 'mutual',
  [REVIEW_SCOPES.NOT_FOLLOWING_BACK]: 'not-following-back',
  [REVIEW_SCOPES.FOLLOWS_YOU_ONLY]: 'follows-you-only',
  [REVIEW_SCOPES.ALL_CURRENT]: 'everyone',
  [REVIEW_SCOPES.ALL_ACCOUNTS]: 'everyone-past',
};

const DECISION_VALUES: Record<DecisionFilter, string> = {
  [DecisionFilter.ANY]: 'any',
  [DecisionFilter.NEEDS_DECISION]: 'undecided',
  [DecisionFilter.KEPT]: 'kept',
  [DecisionFilter.QUEUED]: 'queued',
};

/** What a URL says about the screen. */
export type UrlFilters = Omit<FiltersState, 'view'> & {
  /** null: To do without a tab (`/todo`), for the caller to pick one. */
  view: ListView | null;
};

/** The URL filters with nothing narrowing Review. */
export const URL_DEFAULTS = {
  view: LIST_VIEWS.REVIEW,
  scope: REVIEW_SCOPES.FOLLOWING,
  ...NO_FILTERS,
  query: '',
} as const satisfies UrlFilters;

/** The key whose value is `value`, or undefined. */
function keyOf<K extends string>(values: Record<K, string>, value: string | null): K | undefined {
  return (Object.keys(values) as K[]).find(key => values[key] === value);
}

function tagToParam(tag: TagFilter): string | null {
  switch (tag.kind) {
    case TAG_FILTER_KINDS.ALL:
      return null;
    case TAG_FILTER_KINDS.UNTAGGED:
      return NO_TAGS;
    case TAG_FILTER_KINDS.TAG:
      return tag.tag === NO_TAGS || tag.tag.startsWith(TAG_ESCAPE) ? TAG_ESCAPE + tag.tag : tag.tag;
  }
}

function tagFromParam(param: string | null): TagFilter {
  if (!param) {
    return NO_FILTERS.tag; // missing or empty: no tag filter
  }
  if (param === NO_TAGS) {
    return { kind: TAG_FILTER_KINDS.UNTAGGED };
  }
  return { kind: TAG_FILTER_KINDS.TAG, tag: param.startsWith(TAG_ESCAPE) ? param.slice(1) : param };
}

/** The URL (path + search) for what's on screen. */
export function filtersToUrl(filters: FiltersState): string {
  const path = VIEW_PATHS[filters.view];
  if (filters.view !== LIST_VIEWS.REVIEW) {
    return path;
  }
  const params = new URLSearchParams();
  if (filters.scope !== URL_DEFAULTS.scope) {
    params.set(UrlParam.LIST, SCOPE_VALUES[filters.scope]);
  }
  if (filters.decision !== URL_DEFAULTS.decision) {
    params.set(UrlParam.DECISION, DECISION_VALUES[filters.decision]);
  }
  const tag = tagToParam(filters.tag);
  if (tag !== null) {
    params.set(UrlParam.TAG, tag);
  }
  if (filters.query) {
    params.set(UrlParam.QUERY, filters.query);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

/** What a URL shows. Unknown paths, params and values fall back to the defaults. */
export function filtersFromUrl(pathname: string, search: string): UrlFilters {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const found = PATH_VIEWS.get(path); // undefined: an unknown path
  const view = found === undefined ? LIST_VIEWS.REVIEW : found;
  if (view !== LIST_VIEWS.REVIEW) {
    return { ...URL_DEFAULTS, view };
  }
  const params = new URLSearchParams(search);
  return {
    view,
    scope: keyOf(SCOPE_VALUES, params.get(UrlParam.LIST)) ?? URL_DEFAULTS.scope,
    decision: keyOf(DECISION_VALUES, params.get(UrlParam.DECISION)) ?? URL_DEFAULTS.decision,
    tag: tagFromParam(params.get(UrlParam.TAG)),
    query: params.get(UrlParam.QUERY) ?? '',
  };
}
