import { ACTION_TYPES, REVIEW_SCOPES, REVIEW_STATUSES, TAG_FILTER_KINDS, parseMaster, toMasterFile } from "../../core/index.ts";

const { UNFOLLOW, REMOVE_FOLLOWER } = ACTION_TYPES;
import { must } from "../../core/__tests__/helpers.ts";
import type { TabStore } from "../../io/tabStore.ts";
import { CHANGE_VIEWS, setQuery, setReviewStatus, setScope, setTagFilter, setChangeView } from "../filtersSlice.ts";
import { resetScope, setAction, setNote, setReviewed, setUnavailable, toggleTag } from "../masterSlice.ts";
import {
  selectAccount,
  selectIsDirty,
  selectActionStats,
  selectScopeStats,
  selectSessionDiff,
  selectVisibleAccountKeys,
} from "../selectors.ts";
import { importPrepared, restoreTab, saveMaster } from "../thunks.ts";
import { WRITES, deferred, flushPersistence, makeTestStore, prepared, recordingTab } from "./testStore.ts";

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
    expect(s.master.base?.lastImportAt).toBe("2026-10-27T12:00:00.000Z");
    expect(Object.keys(s.master.changed)).toEqual([]); // the imported master is the session baseline
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
  });

  test("an invalid master is rejected with a readable message and leaves state alone", async () => {
    const { store } = makeTestStore();
    const bad = prepared();
    const result = await store.dispatch(importPrepared({ ...bad, rawMaster: { accounts: [] } }));
    expect(result.payload).toBe("This file is not an Instagram Review master.");
    expect(store.getState().master.base).toBeNull();
    expect(store.getState().master.importStatus).toBe("idle");
  });

  test("a tag filter that no longer exists falls back to all tags", async () => {
    const t = makeTestStore();
    t.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: "nonexistent" }));
    await t.store.dispatch(importPrepared(prepared())).unwrap();
    expect(t.store.getState().filters.tag).toEqual({ kind: TAG_FILTER_KINDS.ALL });
  });
});

describe("edits", () => {
  test("reviewed: stamps lastReviewedAt; un-reviewing keeps it; unknown accounts are a no-op", async () => {
    const t = await importedStore();
    const r0 = t.store.getState().master.revision;
    t.store.dispatch(setReviewed({ username: "bob", reviewed: true }));
    const stamped = account(t, "bob").review.lastReviewedAt;
    expect(stamped).not.toBeNull();
    t.store.dispatch(setReviewed({ username: "bob", reviewed: false }));
    expect(account(t, "bob").review).toMatchObject({ reviewed: false, lastReviewedAt: stamped });
    expect(t.store.getState().master.revision).toBe(r0 + 2);

    t.store.dispatch(setReviewed({ username: "nobody", reviewed: true }));
    expect(t.store.getState().master.revision).toBe(r0 + 2);
  });

  test("unavailable: marking also reviews; clearing does not un-review", async () => {
    const t = await importedStore();
    t.store.dispatch(setUnavailable({ username: "bob", unavailable: true }));
    expect(account(t, "bob").review).toMatchObject({ unavailable: true, reviewed: true });
    t.store.dispatch(setUnavailable({ username: "bob", unavailable: false }));
    expect(account(t, "bob").review).toMatchObject({ unavailable: false, reviewed: true });
  });

  test("actions: checking adds a pending action and reviews; unchecking cancels; ineligible is ignored", async () => {
    const t = await importedStore();
    t.store.dispatch(setAction({ username: "bob", type: UNFOLLOW, checked: true }));
    expect(account(t, "bob").actions.pending).toEqual([UNFOLLOW]);
    expect(selectActionStats(t.store.getState()).pending[UNFOLLOW]).toBe(1);
    expect(account(t, "bob").review.reviewed).toBe(true);

    t.store.dispatch(setAction({ username: "bob", type: UNFOLLOW, checked: false }));
    expect(account(t, "bob").actions).toEqual({ pending: [], confirmed: [] });

    const r = t.store.getState().master.revision;
    t.store.dispatch(setAction({ username: "bob", type: REMOVE_FOLLOWER, checked: true })); // bob doesn't follow you
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

    t.store.dispatch(resetScope({ scope: REVIEW_SCOPES.MUTUAL, tag: { kind: TAG_FILTER_KINDS.ALL } }));
    expect(account(t, "alice").review).toMatchObject({ reviewed: false, tags: ["artist"] });
    expect(account(t, "alice").review.lastReviewedAt).not.toBeNull();
    expect(account(t, "bob").review.reviewed).toBe(true);
    expect(t.store.getState().filters.reviewStatus).toBe(REVIEW_STATUSES.NEEDS_REVIEW);
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
    const saved = JSON.parse(file.text) as { lastSavedAt: string };
    expect(saved.lastSavedAt).toBe("2026-10-27T14:05:09.000Z");
    expect(toMasterFile(parseMaster(saved))).toEqual(saved); // the file is exactly the saved format

    const s = t.store.getState();
    expect(selectIsDirty(s)).toBe(false);
    expect(selectSessionDiff(s)).toHaveLength(1);
    expect(t.lastSaved.get()).toBe("2026-10-27T14:05:09.000Z");
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

describe("reload safety net", () => {
  test("a reload puts back the work, including the session baseline", async () => {
    const t = await importedStore();
    t.store.dispatch(setReviewed({ username: "bob", reviewed: true }));
    t.store.dispatch(toggleTag({ username: "bob", tag: "artist" }));
    await flushPersistence();

    const reloaded = makeTestStore({ tab: t.tab });
    await reloaded.store.dispatch(restoreTab());
    const before = t.store.getState();
    const after = reloaded.store.getState();

    expect(selectIsDirty(after)).toBe(true);
    expect(after.master.revision).toBe(before.master.revision);
    expect(JSON.parse(JSON.stringify(after.master.base))).toEqual(JSON.parse(JSON.stringify(before.master.base)));
    expect(JSON.parse(JSON.stringify(after.master.changed))).toEqual(JSON.parse(JSON.stringify(before.master.changed)));
    expect(selectSessionDiff(after)).toEqual(selectSessionDiff(before));
  });

  test("a new tab (nothing stored) starts empty", async () => {
    const { store } = makeTestStore();
    expect(await store.dispatch(restoreTab()).unwrap()).toBeNull();
    expect(store.getState().master.base).toBeNull();
  });

  test("import stores the master once; each edit stores only the accounts it changed", async () => {
    const { tab, writes } = recordingTab();
    const t = makeTestStore({ tab });
    await t.store.dispatch(importPrepared(prepared())).unwrap();
    await flushPersistence();
    expect(writes).toEqual([{ kind: WRITES.REPLACE, accounts: [] }]);

    t.store.dispatch(setNote({ username: "bob", note: "x" }));
    await flushPersistence();
    t.store.dispatch(resetScope({ scope: REVIEW_SCOPES.FOLLOWING, tag: { kind: TAG_FILTER_KINDS.ALL } })); // nothing reviewed: no change
    t.store.dispatch(setReviewed({ username: "alice", reviewed: true }));
    t.store.dispatch(setReviewed({ username: "carol", reviewed: true }));
    await flushPersistence();
    expect(writes.slice(1)).toEqual([
      { kind: WRITES.UPDATE, accounts: ["bob"] },
      { kind: WRITES.UPDATE, accounts: ["alice"] }, // carol arrived during this write…
      { kind: WRITES.UPDATE, accounts: ["carol"] }, // …and was folded into one follow-up
    ]);

    await t.store.dispatch(saveMaster()).unwrap();
    await flushPersistence();
    expect(writes.at(-1)).toEqual({ kind: WRITES.UPDATE, accounts: [] }); // saving only touches metadata
  });

  test("restoring after a reload writes nothing", async () => {
    const first = await importedStore();
    first.store.dispatch(setReviewed({ username: "bob", reviewed: true }));
    await flushPersistence();

    const { tab, writes } = recordingTab(first.tab);
    const reloaded = makeTestStore({ tab });
    await reloaded.store.dispatch(restoreTab());
    await flushPersistence();
    expect(writes).toEqual([]);

    reloaded.store.dispatch(setNote({ username: "bob", note: "after reload" }));
    await flushPersistence();
    expect(writes).toEqual([{ kind: WRITES.UPDATE, accounts: ["bob"] }]);
  });

  test("a new import replaces what was stored for the tab", async () => {
    const t = await importedStore();
    t.store.dispatch(setNote({ username: "bob", note: "old session" }));
    await flushPersistence();
    await t.store.dispatch(importPrepared(prepared({ following: [["zed"]], followers: [["zed"]] }))).unwrap();
    await flushPersistence();

    const stored = must(await t.tab.load());
    expect(Object.keys(stored.changed)).toEqual([]);
    expect(Object.keys((stored.base as { accounts: object }).accounts)).toEqual(["zed"]);
  });

  test("unusable stored data is ignored", async () => {
    const t = makeTestStore();
    await t.tab.replace({ version: 1, lastImportAt: "x", tagOptions: [], accounts: { bob: { username: "" } } }, {
      revision: 1, savedRevision: 0, message: "", storedAt: "x",
    }, {});
    expect(await t.store.dispatch(restoreTab()).unwrap()).toBeNull();
  });

  test("storage failures are surfaced, not swallowed, and saving still works", async () => {
    const failing: TabStore = {
      durable: true,
      load: () => Promise.reject(new Error("no idb")),
      replace: () => Promise.reject(new Error("quota")),
      update: () => Promise.reject(new Error("quota")),
    };
    const t = await importedStore({ tab: failing });
    await flushPersistence();
    expect(t.store.getState().master.persistenceFailed).toBe(true);
    expect(await t.store.dispatch(restoreTab()).unwrap()).toBeNull();
    await expect(t.store.dispatch(saveMaster()).unwrap()).resolves.toBeTruthy();
  });
});

describe("selectors", () => {
  test("visible accounts follow scope, status, tag and search, sorted by username", async () => {
    const t = await importedStore();
    const keys = () => selectVisibleAccountKeys(t.store.getState());
    expect(keys()).toEqual(["alice", "bob", "carol"]); // I follow

    t.store.dispatch(setScope(REVIEW_SCOPES.FOLLOWERS));
    expect(keys()).toEqual(["alice", "dave"]);
    t.store.dispatch(setScope(REVIEW_SCOPES.ALL_CURRENT));
    t.store.dispatch(toggleTag({ username: "dave", tag: "artist" }));
    t.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.TAG, tag: "artist" }));
    expect(keys()).toEqual(["dave"]);
    t.store.dispatch(setTagFilter({ kind: TAG_FILTER_KINDS.UNTAGGED }));
    t.store.dispatch(setReviewed({ username: "bob", reviewed: true }));
    t.store.dispatch(setReviewStatus(REVIEW_STATUSES.NEEDS_REVIEW));
    expect(keys()).toEqual(["alice", "carol"]);
    t.store.dispatch(setQuery(" CAR "));
    expect(keys()).toEqual(["carol"]);
  });

  test("change tabs list who started/stopped following you in the latest import, regardless of scope", async () => {
    const t = await importedStore();
    await t.store.dispatch(saveMaster()).unwrap();
    const saved = JSON.parse(must(t.downloads[0]).text) as unknown;
    await t.store.dispatch(importPrepared(prepared({ master: saved, following: [["alice"], ["erin"]], followers: [["alice"], ["erin"]] }))).unwrap();

    t.store.dispatch(setScope(REVIEW_SCOPES.FOLLOWING));
    t.store.dispatch(setChangeView(CHANGE_VIEWS.LOST_FOLLOWERS));
    expect(selectVisibleAccountKeys(t.store.getState())).toEqual(["dave"]);
    t.store.dispatch(setChangeView(CHANGE_VIEWS.NEW_FOLLOWERS));
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
