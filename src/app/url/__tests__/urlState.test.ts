import { DecisionFilter, REVIEW_SCOPES, TAG_FILTER_KINDS, type TagFilter } from '@/entities/master/lib/index.ts';
import { LIST_VIEWS } from '@/entities/master/model/views.ts';
import { type FiltersState } from '@/features/filters';

import { URL_DEFAULTS, filtersFromUrl, filtersToUrl } from '../urlState.ts';

const review = (changes: Partial<FiltersState> = {}): FiltersState => ({ ...URL_DEFAULTS, ...changes });
const tag = (name: string): TagFilter => ({ kind: TAG_FILTER_KINDS.TAG, tag: name });

/** Reads a URL written by filtersToUrl. */
function read(url: string) {
  const { pathname, search } = new URL(url, 'https://example.com');
  return filtersFromUrl(pathname, search);
}

describe('filtersToUrl / filtersFromUrl', () => {
  test('each page has its own path', () => {
    expect(filtersToUrl(review())).toBe('/');
    expect(filtersToUrl(review({ view: LIST_VIEWS.CHANGES }))).toBe('/changes');
    expect(filtersToUrl(review({ view: LIST_VIEWS.TO_UNFOLLOW }))).toBe('/todo/unfollow');
    expect(filtersToUrl(review({ view: LIST_VIEWS.TO_REMOVE }))).toBe('/todo/remove');
    for (const view of Object.values(LIST_VIEWS)) {
      expect(read(filtersToUrl(review({ view })))).toEqual(review({ view }));
    }
  });

  test('every list and decision goes there and back, in kebab-case', () => {
    expect(filtersToUrl(review({ scope: REVIEW_SCOPES.NOT_FOLLOWING_BACK }))).toBe('/?list=not-following-back');
    expect(filtersToUrl(review({ scope: REVIEW_SCOPES.ALL_CURRENT }))).toBe('/?list=everyone');
    expect(filtersToUrl(review({ scope: REVIEW_SCOPES.ALL_ACCOUNTS }))).toBe('/?list=everyone-past');
    expect(filtersToUrl(review({ decision: DecisionFilter.NEEDS_DECISION }))).toBe('/?decision=undecided');
    for (const scope of Object.values(REVIEW_SCOPES)) {
      expect(read(filtersToUrl(review({ scope })))).toEqual(review({ scope }));
    }
    for (const decision of Object.values(DecisionFilter)) {
      expect(read(filtersToUrl(review({ decision })))).toEqual(review({ decision }));
    }
  });

  test('defaults are left out; params keep a fixed order', () => {
    expect(filtersToUrl(review({ scope: REVIEW_SCOPES.FOLLOWING, decision: DecisionFilter.ANY }))).toBe('/');
    const all = review({
      query: 'anna k',
      tag: tag('friends'),
      decision: DecisionFilter.KEPT,
      scope: REVIEW_SCOPES.FOLLOWERS,
    });
    expect(filtersToUrl(all)).toBe('/?list=followers&decision=kept&tag=friends&q=anna+k');
    expect(read(filtersToUrl(all))).toEqual(all);
  });

  test('tags: none is No tags, a real "none" or "~…" gets a "~", any text survives', () => {
    const untagged = review({ tag: { kind: TAG_FILTER_KINDS.UNTAGGED } });
    expect(filtersToUrl(untagged)).toBe('/?tag=none');
    expect(read('/?tag=none')).toEqual(untagged);
    expect(filtersToUrl(review({ tag: tag('none') }))).toBe('/?tag=%7Enone');
    expect(filtersToUrl(review({ tag: tag('~x') }))).toBe('/?tag=%7E%7Ex');
    for (const name of ['none', '~none', '~x', '~', 'None', 'best friends', '#1 & co', '🌸', 'a=b?c']) {
      expect(read(filtersToUrl(review({ tag: tag(name) })))).toEqual(review({ tag: tag(name) }));
    }
    expect(read('/?tag=')).toEqual(review()); // empty: no tag filter
  });

  test('filters are only on Review: not written elsewhere, and ignored there', () => {
    const filtered = { scope: REVIEW_SCOPES.MUTUAL, tag: tag('friends'), query: 'an' };
    expect(filtersToUrl(review({ ...filtered, view: LIST_VIEWS.CHANGES }))).toBe('/changes');
    expect(read('/changes?list=mutual&tag=friends&q=an')).toEqual(review({ view: LIST_VIEWS.CHANGES }));
  });

  test('/todo alone leaves the tab to the caller', () => {
    expect(read('/todo')).toEqual({ ...review(), view: null });
    expect(read('/todo/')).toEqual({ ...review(), view: null });
  });

  test('unknown paths, params and values fall back to the defaults', () => {
    expect(read('/foo')).toEqual(review());
    expect(read('/todo/later')).toEqual(review());
    expect(read('/Changes')).toEqual(review()); // paths are lowercase
    expect(read('/changes/')).toEqual(review({ view: LIST_VIEWS.CHANGES }));
    expect(read('/?list=friends&decision=xyz&foo=1')).toEqual(review());
    expect(read('/?list=notFollowingBack')).toEqual(review()); // code names aren't URL values
    expect(read('/?decision=undecided&decision=kept')).toEqual(review({ decision: DecisionFilter.NEEDS_DECISION }));
  });
});
