import { parseMaster } from "../../core/index.ts";
import { must } from "../../core/__tests__/helpers.ts";
import type { SessionStore } from "../../io/sessionStore.ts";
import { setQuery, setReviewStatus, setScope, setTagFilter, setChangeView } from "../filtersSlice.ts";
import { resetScope, restoreSession, setAction, setNote, setReviewed, setUnavailable, toggleTag } from "../masterSlice.ts";
import {
  selectAccount,
  selectIsDirty,
  selectActionStats,
  selectScopeStats,
  selectSessionDiff,
  selectVisibleAccountKeys,
} from "../selectors.ts";
import { importPrepared, loadStoredSession, saveMaster } from "../thunks.ts";
import { deferred, flushPersistence, makeTestStore, prepared } from "./testStore.ts";

async function importedStore(options: Parameters<typeof makeTestStore>[0] = {}) {
  const t = makeTestStore(options);
  await t.store.dispatch(importPrepared(prepared())).unwrap();
  return t;
}

const account = (t: Awaited<ReturnType<typeof importedStore>>, key: string) => must(selectAccount(t.store.getState(), key), key);

describe("import", () => {
  test("first import starts a dirty master whose baseline is the imported state", async () => {
    const { store } = await importedStore();
    const s = store.getState();
    expect(s.master.master?.snapshots).toHaveLength(1);
    expect(s.master.baseline).toBe(s.master.master);
    expect(s.master.pendingSnapshot).toBe(true);
    expect(selectIsDirty(s)).toBe(true);
    expect(s.master.message).toMatch(/^Started a new master/);
  });

  test("re-importing the saved master with the same export is clean", async () => {
    const t = await importedStore();
    await t.store.dispatch(saveMaster()).unwrap();
    const saved = JSON.parse(must(t.downloads[0]).text) as unknown;

    const t2 = makeTestStore();
    await t2.store.dispatch(importPrepared(prepared({ master: saved }))).unwrap();
    expect(selectIsDirty(t2.store.getState())).toBe(false);
    expect(t2.store.getState().master.pendingSnapshot).toBe(false);
  });

  test("an invalid master is rejected with a readable message and leaves state alone", async () => {
    const { store } = makeTestStore();
    const bad = prepared();
    const result = await store.dispatch(importPrepared({ ...bad, rawMaster: { accounts: [] } }));
    expect(result.payload).toBe("This file is not an Instagram Review master.");
    expect(store.getState().master.master).toBeNull();
    expect(store.getState().master.importStatus).toBe("idle");
  });

  test("a tag filter that no longer exists falls back to all tags", async () => {
    const t = makeTestStore();
    t.store.dispatch(setTagFilter({ kind: "tag", tag: "nonexistent" }));
    await t.store.dispatch(importPrepared(prepared())).unwrap();
    expect(t.store.getState().filters.tag).toEqual({ kind: "all" });
  });
});

describe("edits", () => {
  test("reviewed: stamps last_reviewed_at; un-reviewing keeps it; unknown accounts are a no-op", async () => {
    const t = await importedStore();
    const r0 = t.store.getState().master.revision;
    t.store.dispatch(setReviewed({ username: "bob", reviewed: true }));
    const stamped = account(t, "bob").review.last_reviewed_at;
    expect(stamped).not.toBeNull();
    t.store.dispatch(setReviewed({ username: "bob", reviewed: false }));
    expect(account(t, "bob").review).toMatchObject({ reviewed: false, last_reviewed_at: stamped });
    expect(t.store.getState().master.revision).toBe(r0 + 2);

    t.store.dispatch(setReviewed({ username: "nobody", reviewed: true }));
    expect(t.store.getState().master.revision).toBe(r0 + 2);
  });

  test("unavailable: marking also reviews; clearing does not un-review", async () => {
    const t = await importedStore();
    t.store.dispatch(setUnavailable({ username: "bob", unavailable: true }));
    expect(account(t, "bob").review).toMatchObject({ deleted_or_unavailable: true, reviewed: true });
    t.store.dispatch(setUnavailable({ username: "bob", unavailable: false }));
    expect(account(t, "bob").review).toMatchObject({ deleted_or_unavailable: false, reviewed: true });
  });

  test("actions: checking adds a pending action and reviews; unchecking cancels; ineligible is ignored", async () => {
    const t = await importedStore();
    t.store.dispatch(setAction({ username: "bob", type: "unfollow", checked: true }));
    expect(account(t, "bob").actions.pending).toEqual(["unfollow"]);
    expect(selectActionStats(t.store.getState()).pending.total).toBe(1);
    expect(account(t, "bob").review.reviewed).toBe(true);

    t.store.dispatch(setAction({ username: "bob", type: "unfollow", checked: false }));
    expect(account(t, "bob").actions).toEqual({ pending: [], confirmed: [] });

    const r = t.store.getState().master.revision;
    t.store.dispatch(setAction({ username: "bob", type: "remove_follower", checked: true })); // bob doesn't follow you
    expect(t.store.getState().master.revision).toBe(r);
    expect(account(t, "bob").review.reviewed).toBe(true);
  });

  test("tags toggle and notes only count real changes", async () => {
    const t = await importedStore();
    t.store.dispatch(toggleTag({ username: "carol", tag: "artist" }));
    expect(account(t, "carol").review.tags).toEqual(["artist"]);
    t.store.dispatch(toggleTag({ username: "carol", tag: "artist" }));
    expect(account(t, "carol").review.tags).toEqual([]);

    t.store.dispatch(setNote({ username: "carol", note: "hi" }));
    const r = t.store.getState().master.revision;
    t.store.dispatch(setNote({ username: "carol", note: "hi" }));
    expect(t.store.getState().master.revision).toBe(r);
  });

  test("reset scope only resets matching reviewed accounts and switches to Needs review", async () => {
    const t = await importedStore();
    t.store.dispatch(setReviewed({ username: "alice", reviewed: true })); // mutual
    t.store.dispatch(setReviewed({ username: "bob", reviewed: true })); // not following back
    t.store.dispatch(toggleTag({ username: "alice", tag: "artist" }));
    t.store.dispatch(setQuery("zzz")); // ignored by reset

    t.store.dispatch(resetScope({ scope: "mutual", tag: { kind: "all" } }));
    expect(account(t, "alice").review).toMatchObject({ reviewed: false, tags: ["artist"] });
    expect(account(t, "alice").review.last_reviewed_at).not.toBeNull();
    expect(account(t, "bob").review.reviewed).toBe(true);
    expect(t.store.getState().filters.reviewStatus).toBe("needs_review");
  });
});

describe("save", () => {
  test("downloads a master that re-imports unchanged; the session baseline is kept", async () => {
    const t = await importedStore();
    t.store.dispatch(setReviewed({ username: "bob", reviewed: true }));
    t.setNow("2026-10-27T14:05:09.000Z");
    await t.store.dispatch(saveMaster()).unwrap();

    const file = must(t.downloads[0]);
    expect(file.filename).toMatch(/^instagram_master_tracker_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
    const saved = JSON.parse(file.text) as { last_saved_at: string };
    expect(saved.last_saved_at).toBe("2026-10-27T14:05:09.000Z");
    expect(JSON.parse(JSON.stringify(parseMaster(saved)))).toEqual(saved); // the file is exactly the saved format

    const s = t.store.getState();
    expect(selectIsDirty(s)).toBe(false);
    expect(s.master.pendingSnapshot).toBe(false);
    expect(selectSessionDiff(s).changedAccounts).toBe(1);
    expect(await t.sessionStore.getLastSavedAt()).toBe("2026-10-27T14:05:09.000Z");
  });

  test("edits made while saving stay unsaved", async () => {
    const gate = deferred();
    const t = makeTestStore({ download: () => gate.promise });
    await t.store.dispatch(importPrepared(prepared())).unwrap();

    const saving = t.store.dispatch(saveMaster());
    t.store.dispatch(setNote({ username: "bob", note: "typed during save" }));
    gate.resolve();
    await saving;

    expect(selectIsDirty(t.store.getState())).toBe(true);
    expect(t.store.getState().master.message).toMatch(/Changes made while saving/);
  });

  test("a second save while one is running is ignored", async () => {
    const gate = deferred();
    const calls: string[] = [];
    const t = makeTestStore({ download: name => { calls.push(name); return gate.promise; } });
    await t.store.dispatch(importPrepared(prepared())).unwrap();

    const first = t.store.dispatch(saveMaster());
    await t.store.dispatch(saveMaster());
    gate.resolve();
    await first;
    expect(calls).toHaveLength(1);
  });

  test("saving with nothing loaded is rejected", async () => {
    const { store } = makeTestStore();
    const result = await store.dispatch(saveMaster());
    expect(result.payload).toMatch(/Nothing to save/);
  });
});

describe("browser storage", () => {
  test("unsaved work is stored and can be resumed with its baseline", async () => {
    const t = await importedStore();
    t.store.dispatch(setReviewed({ username: "bob", reviewed: true }));
    t.store.dispatch(toggleTag({ username: "bob", tag: "artist" }));
    await flushPersistence();

    const t2 = makeTestStore({ sessionStore: t.sessionStore });
    const restored = must(await t2.store.dispatch(loadStoredSession()).unwrap());
    t2.store.dispatch(restoreSession(restored));
    const s = t2.store.getState();

    expect(selectIsDirty(s)).toBe(true);
    expect(selectSessionDiff(s).summary).toEqual(selectSessionDiff(t.store.getState()).summary);
    expect(selectVisibleAccountKeys(s)).toEqual(selectVisibleAccountKeys(t.store.getState()));
  });

  test("a corrupt stored draft is ignored", async () => {
    const t = makeTestStore();
    await t.sessionStore.saveSession({ master: { nope: 1 }, baseline: {}, revision: 1, savedRevision: 0, pendingSnapshot: false, message: "", storedAt: "x" });
    expect(await t.store.dispatch(loadStoredSession()).unwrap()).toBeNull();
  });

  test("storage failures are surfaced, not swallowed", async () => {
    const failing: SessionStore = {
      loadSession: () => Promise.reject(new Error("no idb")),
      saveSession: () => Promise.reject(new Error("quota")),
      clearSession: () => Promise.resolve(),
      getLastSavedAt: () => Promise.resolve(null),
      setLastSavedAt: () => Promise.reject(new Error("quota")),
    };
    const t = await importedStore({ sessionStore: failing });
    await flushPersistence();
    expect(t.store.getState().master.persistenceFailed).toBe(true);
    expect(await t.store.dispatch(loadStoredSession()).unwrap()).toBeNull();
    await expect(t.store.dispatch(saveMaster()).unwrap()).resolves.toBeTruthy(); // download still works
  });
});

describe("selectors", () => {
  test("visible accounts follow scope, status, tag and search, sorted by username", async () => {
    const t = await importedStore();
    const keys = () => selectVisibleAccountKeys(t.store.getState());
    expect(keys()).toEqual(["alice", "bob", "carol"]); // I follow

    t.store.dispatch(setScope("followers"));
    expect(keys()).toEqual(["alice", "dave"]);
    t.store.dispatch(setScope("all_current"));
    t.store.dispatch(toggleTag({ username: "dave", tag: "artist" }));
    t.store.dispatch(setTagFilter({ kind: "tag", tag: "artist" }));
    expect(keys()).toEqual(["dave"]);
    t.store.dispatch(setTagFilter({ kind: "untagged" }));
    t.store.dispatch(setReviewed({ username: "bob", reviewed: true }));
    t.store.dispatch(setReviewStatus("needs_review"));
    expect(keys()).toEqual(["alice", "carol"]);
    t.store.dispatch(setQuery(" CAR "));
    expect(keys()).toEqual(["carol"]);
  });

  test("change tabs list the latest snapshot's changes regardless of scope", async () => {
    const t = await importedStore();
    await t.store.dispatch(saveMaster()).unwrap();
    const saved = JSON.parse(must(t.downloads[0]).text) as unknown;
    await t.store.dispatch(importPrepared(prepared({ master: saved, following: [["alice"], ["erin"]], followers: [["alice"]] }))).unwrap();

    t.store.dispatch(setScope("followers"));
    t.store.dispatch(setChangeView("unfollowed_since"));
    expect(selectVisibleAccountKeys(t.store.getState())).toEqual(["bob", "carol"]);
    t.store.dispatch(setChangeView("new_unfollowers"));
    expect(selectVisibleAccountKeys(t.store.getState())).toEqual(["dave"]);
    t.store.dispatch(setChangeView("followed_since"));
    expect(selectVisibleAccountKeys(t.store.getState())).toEqual(["erin"]);
  });

  test("editing one account keeps the list array and other accounts referentially stable", async () => {
    const t = await importedStore();
    const before = t.store.getState();
    t.store.dispatch(setNote({ username: "bob", note: "x" }));
    const after = t.store.getState();
    expect(selectVisibleAccountKeys(after)).toBe(selectVisibleAccountKeys(before));
    expect(selectAccount(after, "alice")).toBe(selectAccount(before, "alice"));
    expect(selectAccount(after, "bob")).not.toBe(selectAccount(before, "bob"));
  });

  test("scope stats follow scope and tag", async () => {
    const t = await importedStore();
    t.store.dispatch(setReviewed({ username: "bob", reviewed: true }));
    expect(selectScopeStats(t.store.getState())).toEqual({ total: 3, reviewed: 1, needsReview: 2, unavailable: 0 });
  });

  test("selector results are read-only at compile time", async () => {
    const t = await importedStore();
    const alice = account(t, "alice");
    expect(() => {
      // @ts-expect-error state handed to components must not be writable
      alice.review.reviewed = true;
    }).toThrow(TypeError); // and Immer has frozen it at runtime too
  });
});
