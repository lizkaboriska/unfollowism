import { createSlice, original, type PayloadAction } from "@reduxjs/toolkit";
import {
  REVIEW_STATUSES,
  accountOf,
  actionIneligibility,
  cancelPending,
  copyAccount,
  createDict,
  isPending,
  markPending,
  markReviewed,
  reviewStatusMatches,
  scopeMatches,
  tagMatches,
  usernameKey,
  type Account,
  type ActionType,
  type Master,
  type ReadonlyAccount,
  type ReviewScope,
  type TagFilter,
} from "../core/index.ts";
import { IMPORT_STATUSES, SAVE_STATUSES, STATUS_EVENTS, type ImportStatus, type SaveStatus, type StatusEvent } from "./statuses.ts";
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
  /** `changed` as written to the last downloaded file (empty if not saved since the import). Reset changes goes back to it. */
  savedChanged: Record<string, Account>;
  /** lastSavedAt of the master (from the imported file, then from each save). */
  savedAt: string | null;
  /** Bumped by every edit. Unsaved ⇔ revision !== savedRevision. */
  revision: number;
  savedRevision: number;
  importStatus: ImportStatus;
  saveStatus: SaveStatus;
  /** What last happened (import, save…), for the status bar. The UI words it. */
  status: StatusEvent | null;
  /** `status` as it was right after the last save (or the import): Reset changes puts it back. Not restored after a reload, like `status`. */
  savedStatus: StatusEvent | null;
  /** Browser storage failed: unsaved work won't survive a reload. */
  persistenceFailed: boolean;
}

const initialState: MasterState = {
  base: null,
  changed: createDict<Account>(),
  savedChanged: createDict<Account>(),
  savedAt: null,
  revision: 0,
  savedRevision: 0,
  importStatus: IMPORT_STATUSES.IDLE,
  saveStatus: SAVE_STATUSES.IDLE,
  status: null,
  savedStatus: null,
  persistenceFailed: false,
};

/** savedRevision of an import that differs from its file and hasn't been saved since. */
const UNSAVED_IMPORT = -1;

/** Edit payloads carry the timestamp so reducers stay pure. */
function stamped<P>(payload: P) {
  return { payload: { ...payload, at: new Date().toISOString() } };
}

type Stamped<P> = PayloadAction<P & { at: string }>;

/** The account as it is before this reducer runs (imported, or edited earlier). */
function accountBefore(state: MasterState, username: string): ReadonlyAccount | undefined {
  const before = original(state);
  return before.base ? accountOf<ReadonlyAccount>(before.base.accounts, before.changed, usernameKey(username)) : undefined;
}

/** Applies an edit, copying the account into `changed` on its first edit so `base` is never copied. */
function applyEdit(state: MasterState, key: string, edit: (account: Account) => void): void {
  const existing = state.changed[key];
  if (existing) {
    edit(existing);
    return;
  }
  const source = original(state).base?.accounts[key];
  if (!source) return;
  const copy = copyAccount(source);
  edit(copy);
  state.changed[key] = copy;
}

/** Edits one account (callers have already checked that the edit changes something). */
function editAccount(state: MasterState, username: string, edit: (account: Account) => void): void {
  if (!accountBefore(state, username)) return;
  applyEdit(state, usernameKey(username), edit);
  state.revision += 1;
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
          account.review.unavailable = payload.unavailable;
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
      if (accountBefore(state, payload.username)?.review.notes === payload.note) return;
      editAccount(state, payload.username, account => { account.review.notes = payload.note; });
    },
    /** Checking records a pending Instagram action and marks the account reviewed; unchecking cancels it. */
    setAction: {
      reducer(state, { payload }: Stamped<{ username: string; type: ActionType; checked: boolean }>) {
        const before = accountBefore(state, payload.username);
        if (!before) return;
        if (!payload.checked) {
          if (!isPending(before, payload.type)) return;
          editAccount(state, payload.username, account => { cancelPending(account, payload.type); });
          return;
        }
        if (actionIneligibility(before, payload.type)) return; // the UI explains why before dispatching
        editAccount(state, payload.username, account => {
          markPending(account, payload.type);
          markReviewed(account, true, payload.at);
        });
      },
      prepare: (p: { username: string; type: ActionType; checked: boolean }) => stamped(p),
    },
    /** Only `reviewed` is reset; search and review-status filters are deliberately ignored. */
    resetScope(state, { payload }: PayloadAction<{ scope: ReviewScope; tag: TagFilter }>) {
      const before = original(state);
      const base = before.base;
      if (!base) return;
      const targets = Object.keys(base.accounts).filter(key => {
        const account = accountOf<ReadonlyAccount>(base.accounts, before.changed, key);
        return !!account && scopeMatches(account, payload.scope) && tagMatches(account, payload.tag) && reviewStatusMatches(account, REVIEW_STATUSES.REVIEWED);
      });
      for (const key of targets) applyEdit(state, key, account => { account.review.reviewed = false; });
      if (targets.length) state.revision += 1;
    },
    /** Undoes everything not in the downloaded file yet: back to the last save, or to the import if not saved since. */
    resetChanges(state) {
      const before = original(state);
      if (!before.base || before.changed === before.savedChanged) return;
      state.changed = before.savedChanged;
      state.revision += 1;
      if (state.savedRevision !== UNSAVED_IMPORT) state.savedRevision = state.revision;
      state.status = before.savedStatus;
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
        state.savedChanged = payload.savedChanged;
        state.savedAt = payload.savedAt;
        state.revision = payload.revision;
        state.savedRevision = payload.savedRevision;
      })
      .addCase(importPrepared.pending, state => {
        state.importStatus = IMPORT_STATUSES.IMPORTING;
      })
      .addCase(importPrepared.fulfilled, (state, { payload }) => {
        state.importStatus = IMPORT_STATUSES.IDLE;
        state.base = payload.master;
        state.changed = createDict<Account>();
        state.savedChanged = state.changed;
        state.savedAt = payload.master.lastSavedAt ?? null;
        state.revision = 0;
        state.savedRevision = payload.dirty ? UNSAVED_IMPORT : 0;
        state.status = {
          type: STATUS_EVENTS.IMPORTED,
          isNewMaster: payload.isNewMaster,
          followerFileCount: payload.followerFileCount,
          summary: payload.summary,
        };
        state.savedStatus = state.status;
      })
      .addCase(importPrepared.rejected, state => {
        state.importStatus = IMPORT_STATUSES.IDLE;
      })
      .addCase(saveMaster.pending, state => {
        state.saveStatus = SAVE_STATUSES.SAVING;
      })
      .addCase(saveMaster.fulfilled, (state, { payload }) => {
        state.saveStatus = SAVE_STATUSES.IDLE;
        state.savedRevision = payload.revision;
        state.savedAt = payload.savedAt;
        state.savedChanged = payload.changed;
        state.status = { type: STATUS_EVENTS.SAVED, filename: payload.filename, changedWhileSaving: state.revision !== payload.revision };
        state.savedStatus = { type: STATUS_EVENTS.SAVED, filename: payload.filename, changedWhileSaving: false };
      })
      .addCase(saveMaster.rejected, (state, { payload, meta }) => {
        if (meta.condition) return; // a save was already running
        state.saveStatus = SAVE_STATUSES.IDLE;
        state.status = { type: STATUS_EVENTS.SAVE_FAILED, reason: payload ?? "unexpected error" };
      });
  },
});

export const { setReviewed, setUnavailable, toggleTag, setNote, setAction, resetScope, resetChanges, persistenceFailed } = masterSlice.actions;
