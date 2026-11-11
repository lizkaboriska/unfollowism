import { useEffect, useMemo, useState } from 'react';

import {
  ImportError,
  analyzeImport,
  errorMessage,
  importPrepared,
  type ImportProblem,
  type ImportSelection,
  type ImportWarning,
  type LastSavedStore,
} from '@/entities/master';
import { loadZipLibrary, readInputs, type InputText } from '@/shared/lib/readInputs.ts';
import { reloadOnce } from '@/shared/lib/reloadOnce.ts';
import { useAppDispatch } from '@/shared/lib/storeHooks.ts';

/** One file the user chose (a .zip counts as one), with the text files read from it. */
export interface ChosenFile {
  /** Name + size + modified time: choosing the same file again is ignored. */
  id: string;
  name: string;
  size: number;
  lastModified: number;
  inputs: InputText[];
  /** Why the file couldn't be read (e.g. a broken zip); it then contributes nothing. */
  readError: string | null;
}

/** Why the chosen files can't be used or imported: a known problem (worded by the UI), or another error's message. */
export type ImportFailure = { problem: ImportProblem } | { message: string };

function toFailure(error: unknown): ImportFailure {
  return error instanceof ImportError ? { problem: error.problem } : { message: errorMessage(error) };
}

async function readChosen(file: File): Promise<ChosenFile> {
  const base = {
    id: `${file.name}:${file.size}:${file.lastModified}`,
    name: file.name,
    size: file.size,
    lastModified: file.lastModified,
  };
  try {
    return { ...base, inputs: await readInputs([file]), readError: null };
  } catch (error) {
    return { ...base, inputs: [], readError: errorMessage(error) };
  }
}

/**
 * The files chosen on the Import screen and what they add up to. Selections add up, from any folders and in any
 * order; each file can be removed. `lastSaved`: when a progress file was last saved from this browser, for the
 * older-file warnings.
 */
export function useImportSelection(lastSaved: LastSavedStore) {
  const dispatch = useAppDispatch();
  const [chosen, setChosen] = useState<readonly ChosenFile[]>([]);
  const [readingCount, setReadingCount] = useState(0);
  const [importFailure, setImportFailure] = useState<ImportFailure | null>(null);
  /** The selection whose master warning was answered (Start fresh / Use older file); a new selection asks again. */
  const [warningDismissedFor, setWarningDismissedFor] = useState<readonly ChosenFile[] | null>(null);

  useEffect(() => {
    // Start loading the zip reader now, so it's ready when a file is picked. If it fails (usually a release while this
    // tab was open removed the old file), reload to get the new release: nothing is picked yet, so nothing is lost.
    // Within the reload cooldown it stays quiet, and a picked zip then shows its own "couldn't be read" error.
    loadZipLibrary().catch(() => {
      reloadOnce();
    });
  }, []);

  // Recomputed from all chosen files after every change. A conflict (e.g. two masters) keeps the list so a file can be
  // removed. The last save from this browser is read here too, once per change rather than on every render.
  const { selection, selectionFailure } = useMemo((): {
    selection: ImportSelection | null;
    selectionFailure: ImportFailure | null;
  } => {
    if (!chosen.length) {
      return { selection: null, selectionFailure: null };
    }
    try {
      return {
        selection: analyzeImport(
          chosen.flatMap(file => file.inputs),
          lastSaved.get(),
        ),
        selectionFailure: null,
      };
    } catch (error) {
      return { selection: null, selectionFailure: toFailure(error) };
    }
  }, [chosen, lastSaved]);

  /** Adds the files to the selection; `replaceId` (a chosen file) is removed at the same time. */
  async function choose(files: File[], replaceId: string | null = null) {
    if (!files.length) {
      return;
    }
    setImportFailure(null);
    setReadingCount(count => count + 1);
    try {
      const read = await Promise.all(files.map(readChosen));
      setChosen(current => {
        const next = current.filter(file => file.id !== replaceId);
        for (const file of read) {
          if (!next.some(existing => existing.id === file.id)) {
            next.push(file);
          }
        }
        return next;
      });
    } finally {
      setReadingCount(count => count - 1);
    }
  }

  function remove(id: string) {
    setImportFailure(null);
    setChosen(current => current.filter(file => file.id !== id));
  }

  function clearAll() {
    setChosen([]);
    setImportFailure(null);
  }

  /** Imports the selection; true when it worked. Asking about unsaved changes first is up to the caller. */
  async function startImport(): Promise<boolean> {
    const prepared = selection?.prepared;
    if (!prepared) {
      return false;
    }
    setImportFailure(null);
    const result = await dispatch(importPrepared(prepared));
    if (importPrepared.fulfilled.match(result)) {
      return true;
    }
    setImportFailure(result.payload ? { problem: result.payload } : { message: errorMessage(result.error) });
    return false;
  }

  const masterWarning: ImportWarning | null =
    warningDismissedFor === chosen ? null : (selection?.prepared?.warnings[0] ?? null);
  const masterPath = selection?.recognized.master?.path;
  /** The chosen file that holds the progress file, so "Choose newer file" can replace it. */
  const masterFileId = chosen.find(file => file.inputs.some(input => input.path === masterPath))?.id ?? null;

  return {
    chosen,
    isReading: readingCount > 0,
    selection,
    selectionFailure,
    importFailure,
    masterWarning,
    masterFileId,
    choose,
    remove,
    clearAll,
    startImport,
    dismissWarning: () => {
      setWarningDismissedFor(chosen);
    },
  };
}
