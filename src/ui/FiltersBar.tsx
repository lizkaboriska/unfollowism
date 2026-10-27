import type { ReactNode } from "react";
import { Button, Input, NativeSelect, Stack } from "@chakra-ui/react";
import { REVIEW_SCOPES, REVIEW_STATUSES, TAG_FILTER_KINDS, type ReviewScope, type ReviewStatusFilter, type TagFilter } from "../core/index.ts";
import { LIST_VIEWS, isPlanView, setQuery, setReviewStatus, setScope, setTagFilter } from "../store/filtersSlice.ts";
import { useAppDispatch, useAppSelector } from "../store/hooks.ts";
import { resetScope } from "../store/masterSlice.ts";
import { selectScopeStats, selectTagOptions } from "../store/selectors.ts";
import { useConfirm } from "./dialogs.tsx";
import { SCOPE_LABELS, STATUS_LABELS, scopeDescription } from "./labels.ts";
import { plural } from "./statusText.ts";

// A tag can be any text (even "untagged"), so the tag select uses positions as option values.
const ALL_TAGS_VALUE = "all";
const UNTAGGED_VALUE = "untagged";
const tagValue = (index: number) => `tag-${index}`;

function tagFilterValue(tag: TagFilter, tagOptions: readonly string[]): string {
  if (tag.kind === TAG_FILTER_KINDS.ALL) return ALL_TAGS_VALUE;
  if (tag.kind === TAG_FILTER_KINDS.UNTAGGED) return UNTAGGED_VALUE;
  return tagValue(tagOptions.indexOf(tag.tag));
}

function tagFilterOf(value: string, tagOptions: readonly string[]): TagFilter {
  if (value === UNTAGGED_VALUE) return { kind: TAG_FILTER_KINDS.UNTAGGED };
  const tag = tagOptions.find((_, i) => tagValue(i) === value);
  return tag === undefined ? { kind: TAG_FILTER_KINDS.ALL } : { kind: TAG_FILTER_KINDS.TAG, tag };
}

function Select({ name, label, value, onChange, children }: { name: string; label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <NativeSelect.Root size="sm" width={{ base: "full", md: "auto" }}>
      <NativeSelect.Field name={name} aria-label={label} value={value} onChange={e => { onChange(e.currentTarget.value); }}>
        {children}
      </NativeSelect.Field>
      <NativeSelect.Indicator />
    </NativeSelect.Root>
  );
}

export function FiltersBar() {
  const dispatch = useAppDispatch();
  const confirm = useConfirm();
  const filters = useAppSelector(s => s.filters);
  const tagOptions = useAppSelector(selectTagOptions);
  const reviewedInScope = useAppSelector(selectScopeStats).reviewed;
  const inReview = filters.view === LIST_VIEWS.REVIEW;

  async function onResetScope() {
    const confirmed = await confirm({
      title: "Reset reviewed?",
      body: `Reset reviewed for ${plural(reviewedInScope, "account")} matching ${scopeDescription(filters.scope, filters.tag)}? ` +
        "Only the Reviewed tick is cleared; tags, notes and plans stay.",
      confirmLabel: "Reset",
      destructive: true,
    });
    if (confirmed) dispatch(resetScope({ scope: filters.scope, tag: filters.tag }));
  }

  return (
    <Stack direction={{ base: "column", md: "row" }} gap="2" align={{ base: "stretch", md: "center" }} wrap="wrap">
      <Input
        size="sm"
        name="search"
        autoComplete="off"
        width={{ base: "full", md: "48" }}
        placeholder="Search username"
        aria-label="Search username"
        value={filters.query}
        onChange={e => dispatch(setQuery(e.currentTarget.value))}
      />
      {inReview && (
        <Select name="scope" label="Scope" value={filters.scope} onChange={value => dispatch(setScope(value as ReviewScope))}>
          {Object.values(REVIEW_SCOPES).map(scope => <option key={scope} value={scope}>{SCOPE_LABELS[scope]}</option>)}
        </Select>
      )}
      {!isPlanView(filters.view) && (
        <Select name="status" label="Status" value={filters.reviewStatus} onChange={value => dispatch(setReviewStatus(value as ReviewStatusFilter))}>
          {Object.values(REVIEW_STATUSES).map(status => <option key={status} value={status}>{STATUS_LABELS[status]}</option>)}
        </Select>
      )}
      <Select name="tag" label="Tag" value={tagFilterValue(filters.tag, tagOptions)} onChange={value => dispatch(setTagFilter(tagFilterOf(value, tagOptions)))}>
        <option value={ALL_TAGS_VALUE}>All tags</option>
        <option value={UNTAGGED_VALUE}>Untagged</option>
        {tagOptions.map((tag, i) => <option key={tag} value={tagValue(i)}>{tag}</option>)}
      </Select>
      {inReview && (
        <Button size="sm" variant="outline" colorPalette="yellow" disabled={reviewedInScope === 0} onClick={() => void onResetScope()}>
          Reset scope
        </Button>
      )}
    </Stack>
  );
}
