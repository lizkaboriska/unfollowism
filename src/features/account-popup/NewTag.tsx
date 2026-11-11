import { Button, Input } from '@chakra-ui/react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import { findTag, toggleTag } from '@/entities/master';
import { useAppDispatch } from '@/shared/lib/storeHooks.ts';

import { OWN_ESCAPE } from './ownEscape.ts';

// Fields of the account popup (Review and Changes).

/**
 * "+ tag": a new tag is created by adding it to an account (a tag nobody has doesn't exist).
 * A name matching an existing tag in any letter case reuses that tag.
 * Enter (the phone's "Done") or leaving the field adds it; Escape cancels. Closing by key puts focus back on the
 * button: in a popup, focus would otherwise jump to its first button, and the same Enter would press it.
 */
export function NewTag({
  username,
  tags,
  has,
  label = '+ tag',
}: {
  username: string;
  tags: readonly string[];
  has: readonly string[];
  label?: string;
}) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState<string | null>(null); // null = closed
  const button = useRef<HTMLButtonElement>(null);
  /** Closed by Enter or Escape: the field's blur that follows must not add the tag again, and focus goes back. */
  const closedByKey = useRef(false);

  useEffect(() => {
    if (draft === null && closedByKey.current) {
      button.current?.focus();
    }
  }, [draft]);

  if (draft === null) {
    return (
      <Button
        ref={button}
        size="xs"
        variant="ghost"
        onClick={() => {
          closedByKey.current = false;
          setDraft('');
        }}
      >
        {label}
      </Button>
    );
  }

  function add(text: string) {
    const name = text.trim();
    const tag = findTag(tags, name) ?? name;
    if (tag && !has.includes(tag)) {
      dispatch(toggleTag({ username, tag }));
    }
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' && event.key !== 'Escape') {
      return;
    }
    event.preventDefault();
    if (event.key === 'Enter' && draft !== null) {
      add(draft);
    }
    closedByKey.current = true;
    setDraft(null);
  }
  return (
    <Input
      size="xs"
      width="32"
      autoFocus
      name={`newTag-${username}`}
      autoComplete="off"
      enterKeyHint="done"
      // Escape cancels the tag, not the popup around it (see OWN_ESCAPE).
      {...{ [OWN_ESCAPE]: '' }}
      placeholder="new tag…"
      aria-label={`New tag for @${username}`}
      value={draft}
      onChange={event => {
        setDraft(event.currentTarget.value);
      }}
      onKeyDown={onKeyDown}
      onBlur={event => {
        if (!closedByKey.current) {
          add(event.currentTarget.value);
          setDraft(null);
        }
      }}
    />
  );
}
