import { Button, Input, Textarea } from '@chakra-ui/react';
import { useEffect, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import { useDebouncedCallback } from 'use-debounce';

import { findTag } from '@/entities/master/lib/index.ts';
import { setNote, toggleTag } from '@/entities/master/model/masterSlice.ts';

import { useAppDispatch } from '../store/hooks.ts';

import { OWN_ESCAPE } from './ownEscape.ts';

// Fields of the account sheet (Review and Changes).

/**
 * "+ tag": a new tag is created by adding it to an account (a tag nobody has doesn't exist).
 * A name matching an existing tag in any letter case reuses that tag.
 * Enter (the phone's "Done") or leaving the field adds it; Escape cancels. Closing by key puts focus back on the
 * button: in a sheet, focus would otherwise jump to its first button, and the same Enter would press it.
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
      // Escape cancels the tag, not the sheet around it (see OWN_ESCAPE).
      {...{ [OWN_ESCAPE]: '' }}
      placeholder="new tag…"
      aria-label={`New tag for @${username}`}
      value={draft}
      onChange={e => {
        setDraft(e.currentTarget.value);
      }}
      onKeyDown={onKeyDown}
      onBlur={e => {
        if (!closedByKey.current) {
          add(e.currentTarget.value);
          setDraft(null);
        }
      }}
    />
  );
}

/** How long typing must pause before the note is stored. */
const NOTE_DEBOUNCE_MS = 300;

/**
 * The note, stored after a pause in typing (or on leaving the field) rather than on every letter.
 * Shows what you type at once; a change from elsewhere (Reset changes, a confirmed rename) shows when you're not
 * typing.
 */
export function NoteField({
  username,
  note,
  multiline = false,
}: {
  username: string;
  note: string;
  multiline?: boolean;
}) {
  const dispatch = useAppDispatch();
  const [draft, setDraft] = useState(note);
  // flushOnExit: a card scrolled away (or a page closed) mid-typing still stores the note.
  const storeNote = useDebouncedCallback(
    (value: string) => dispatch(setNote({ username, note: value })),
    NOTE_DEBOUNCE_MS,
    { flushOnExit: true },
  );

  // The stored note changed (from typing here, or from elsewhere): show it unless more typing is on its way.
  const [shownNote, setShownNote] = useState(note);
  if (note !== shownNote) {
    setShownNote(note);
    if (!storeNote.isPending()) {
      setDraft(note);
    }
  }

  const field = {
    name: `note-${username}`,
    autoComplete: 'off',
    placeholder: 'Add note…',
    'aria-label': `Note for @${username}`,
    value: draft,
    onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setDraft(e.currentTarget.value);
      storeNote(e.currentTarget.value);
    },
    onBlur: () => storeNote.flush(),
  };
  return multiline ? <Textarea rows={2} {...field} /> : <Input size="sm" {...field} />;
}
