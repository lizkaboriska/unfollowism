import { Input, Textarea } from '@chakra-ui/react';
import { useState, type ChangeEvent } from 'react';
import { useDebouncedCallback } from 'use-debounce';

import { setNote } from '@/entities/master';
import { useAppDispatch } from '@/shared/lib/storeHooks.ts';

// Fields of the account popup (Review and Changes).

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
