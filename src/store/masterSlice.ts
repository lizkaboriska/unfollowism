import { createSlice, original, type PayloadAction } from "@reduxjs/toolkit";
import {
  accountOf,
  actionIneligibility,
  cancelPending,
  copyAccount,
  createDict,
  markPending,
  markReviewed,
  reviewStatusMatches,
  scopeMatches,
  tagMatches,
  usernameKey,
  type Account,
  type ActionType,
  type Master,
  type ReviewScope,
  type TagFilter,
} from "../core/index.ts";
import { importPrepared, restoreTab, saveMaster } from "./thunks.ts";

/**
 * The imported master is kept as-is in `base`, and accounts edited since then live in
 * `changed`. Edits therefore copy only the accounts being edited, never all of them.
 * `base` is also the session baseline the Session changes drawer compares against.
 */
export interface MasterState {
  base: Master | null;
  /** Account key → current version of every account edited since the import. */
  changed: Record<string, Account>;
  /** last_saved_at of the master (from the imported file, then from each save). */
  savedAt: string | null;
  /** Bumped by every edit. Unsaved ⇔ revision !== savedRevision. */
  revision: number;
  savedRevision: number;
  importStatus: "idle" | "importing";
  saveStatus: "idle" | "saving";
  message: string;
  /** Browser storage failed: unsaved work won't survive closing the tab. */
  persistenceFailed: boolean;
}

const initialState: MasterState = {
  base: null,
  changed: createDict<Account>(),
  savedAt: null,
  revision: 0,
  savedRevision: 0,
  importStatus: "idle",
  saveStatus: "idle",
  message: "",
  persistenceFailed: false,
};

/** Edit payloads carry the timestamp so reducers stay pure. */
function stamped<P>(payload: P) {
  return { payload: { ...payload, at: new Date().toISOString() } };
}

type Stamped<P> = PayloadAction<P & { at: string }>;

/**
 * Runs an edit against one account, copying it into `changed` on its first edit.
 * The edit returns false when nothing changed. Returns whether anything changed.
 */
function editOne(state: MasterState, key: string, edit: (account: Account) => boolean | undefined): boolean {
  const existing = state.changed[key];
  if (existing) return edit(existing) !== false;
  // Read the untouched original (not a draft) so `base` is never copied.
  const source = original(state).base?.accounts[key];
  if (!source) return false;
  const copy = copyAccount(source);
  if (edit(copy) === false) return false;
  state.changed[key] = copy;
  return true;
}

/** Edits one account; bumps the revision if it changed. */
function editAccount(state: MasterState, username: string, edit: (account: Account) => boolean | undefined): void {
  if (editOne(state, usernameKey(username), edit)) state.revision += 1;
}

export const masterSlice = createSlice({
  name: "master",
  initialState,
  reducers: {
    setReviewed: {
      reducer(state, { payload }: Stamped<{ username: string; reviewed: boolean }>) {
        editAccount(state, payload.username, account => { markReviewed(account, payload.reviewed, payload.at); });
      },
      prepare: (p: { username: string; reviewed: boolean }) => stamped(p),
    },
    /** Marking unavailable also marks the account reviewed; clearing it does not un-review. */
    setUnavailable: {
      reducer(state, { payload }: Stamped<{ username: string; unavailable: boolean }>) {
        editAccount(state, payload.username, account => {
          account.review.deleted_or_unavailable = payload.unavailable;
          if (payload.unavailable) markReviewed(account, true, payload.at);
        });
      },
      prepare: (p: { username: string; unavailable: boolean }) => stamped(p),
    },
    toggleTag(state, { payload }: PayloadAction<{ username: string; tag: string }>) {
      editAccount(state, payload.username, account => {
        const tags = account.review.tags;
        const index = tags.indexOf(payload.tag);
        if (index === -1) tags.push(payload.tag);
        else tags.splice(index, 1);
      });
    },
    setNote(state, { payload }: PayloadAction<{ username: string; note: string }>) {
      editAccount(state, payload.username, account => {
        if (account.review.notes === payload.note) return false;
        account.review.notes = payload.note;
      });
    },
    /** Checking records a pending Instagram action and marks the account reviewed; unchecking cancels it. */
    setAction: {
      reducer(state, { payload }: Stamped<{ username: string; type: ActionType; checked: boolean }>) {
        editAccount(state, payload.username, account => {
          if (!payload.checked) return cancelPending(account, payload.type);
          if (actionIneligibility(account, payload.type)) return false; // the UI explains why before dispatching
          markPending(account, payload.type);
          markReviewed(account, true, payload.at);
        });
      },
      prepare: (p: { username: string; type: ActionType; checked: boolean }) => stamped(p),
    },
    /** Only `reviewed` is reset; search and review-status filters are deliberately ignored. */
    resetScope(state, { payload }: PayloadAction<{ scope: ReviewScope; tag: TagFilter }>) {
      const before = original(state);
      if (!before.base) return;
      let count = 0;
      for (const key of Object.keys(before.base.accounts)) {
        const account = accountOf(before.base.accounts, before.changed, key);
        if (!account || !scopeMatches(account, payload.scope) || !tagMatches(account, payload.tag) || !reviewStatusMatches(account, "reviewed")) continue;
        if (editOne(state, key, a => { a.review.reviewed = false; })) count += 1;
      }
      if (count > 0) state.revision += 1;
    },
    persistenceFailed(state) {
      state.persistenceFailed = true;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(restoreTab.fulfilled, (state, { payload }) => {
        if (!payload || state.base) return; // nothing stored, or the user already imported meanwhile
        state.base = payload.base;
        state.changed = payload.changed;
        state.savedAt = payload.savedAt;
        state.revision = payload.revision;
        state.savedRevision = payload.savedRevision;
        state.message = payload.message;
      })
      .addCase(importPrepared.pending, state => {
        state.importStatus = "importing";
      })
      .addCase(importPrepared.fulfilled, (state, { payload }) => {
        state.importStatus = "idle";
        state.base = payload.result.master;
        state.changed = createDict<Account>();
        state.savedAt = payload.result.master.last_saved_at ?? null;
        state.revision = 0;
        state.savedRevision = payload.result.dirty ? -1 : 0;
        state.message = payload.message;
      })
      .addCase(importPrepared.rejected, state => {
        state.importStatus = "idle";
      })
      .addCase(saveMaster.pending, state => {
        state.saveStatus = "saving";
      })
      .addCase(saveMaster.fulfilled, (state, { payload }) => {
        state.saveStatus = "idle";
        state.savedRevision = payload.revision;
        state.savedAt = payload.savedAt;
        state.message = state.revision === payload.revision
          ? `Master saved as ${payload.filename}. Keep this file: import it next time.`
          : `Master saved as ${payload.filename}. Changes made while saving are not in that file yet.`;
      })
      .addCase(saveMaster.rejected, (state, { payload, meta }) => {
        if (meta.condition) return; // a save was already running
        state.saveStatus = "idle";
        state.message = `Could not save master: ${payload ?? "unexpected error"}`;
      });
  },
});

export const { setReviewed, setUnavailable, toggleTag, setNote, setAction, resetScope, persistenceFailed } = masterSlice.actions;
