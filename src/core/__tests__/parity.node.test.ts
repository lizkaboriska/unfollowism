// @vitest-environment node
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// Parity referee: the same inputs go through the legacy implementation
// (legacy/tracker-core.js + the merge part of legacy/app.js loadProject, transcribed
// below) and through importExport(). The resulting master JSON must be byte-identical.
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { FOLLOWER_CHANGES, importExport, parseFollowersJson, parseFollowingJson, parseMaster, profileUrl, stringifyMasterFile, toMasterFile, type Master } from "../index.ts";
import { followersFile, followingFile } from "./helpers.ts";

const legacy: any = createRequire(import.meta.url)("../../../legacy/tracker-core.js");
const ROOT = fileURLToPath(new URL("../../../", import.meta.url));
const NOW = "2026-10-27T12:00:00.000Z";

/** Transcription of legacy/app.js loadProject() lines 603–714 with an injected clock. */
function legacyImport(oldMaster: any, followingRaw: unknown, followerRaws: unknown[], followerFileNames: string[]) {
  const following = legacy.dedupeAccounts(legacy.parseFollowingJson(followingRaw));
  const followers = legacy.dedupeAccounts(followerRaws.flatMap(legacy.parseFollowersJson));
  const usernameKey = legacy.usernameKey as (value: unknown) => string;

  const normalized = legacy.normalizeMaster(oldMaster);
  const next = normalized.next;
  const latestStoredSnapshot = next.snapshots.length ? next.snapshots[next.snapshots.length - 1] : null;
  const previousFollowing = new Set(latestStoredSnapshot ? Object.keys(latestStoredSnapshot.following || {}).map(usernameKey) : []);
  const previousFollowers = new Set(latestStoredSnapshot ? Object.keys(latestStoredSnapshot.followers || {}).map(usernameKey) : []);

  const followingMap = new Map<string, any>(following.map((item: any) => [usernameKey(item.username), item]));
  const followersMap = new Map<string, any>(followers.map((item: any) => [usernameKey(item.username), item]));
  const currentFollowing = new Set(followingMap.keys());
  const currentFollowers = new Set(followersMap.keys());
  const allKeys = new Set([...Object.keys(next.accounts).map(usernameKey), ...currentFollowing, ...currentFollowers]);

  for (const key of allKeys) {
    let account = next.accounts[key];
    const followingItem = followingMap.get(key);
    const followerItem = followersMap.get(key);
    if (!account) {
      const sourceItem = followingItem || followerItem;
      const username = sourceItem.username;
      account = next.accounts[key] = { username, url: sourceItem.url || `https://www.instagram.com/${username}`, review: legacy.createReview(), current: {} };
    }
    legacy.ensureReview(account);
    if (followingItem) {
      account.username = followingItem.username;
      account.url = followingItem.url || account.url;
    } else if (followerItem) {
      account.username = followerItem.username;
      account.url = followerItem.url || account.url;
    }
    legacy.syncCurrentRelationship(account, followingItem, followerItem);
  }

  const mutual = [...currentFollowing].filter(key => currentFollowers.has(key));
  const notBack = [...currentFollowing].filter(key => !currentFollowers.has(key));
  const followerOnly = [...currentFollowers].filter(key => !currentFollowing.has(key));
  const newlyFollowing = [...currentFollowing].filter(key => !previousFollowing.has(key));
  const stoppedFollowing = [...previousFollowing].filter(key => !currentFollowing.has(key));
  const newFollowers = [...currentFollowers].filter(key => !previousFollowers.has(key));
  const lostFollowers = [...previousFollowers].filter(key => !currentFollowers.has(key));

  const isDuplicateSnapshot = !!latestStoredSnapshot &&
    legacy.sameUsernameSet(latestStoredSnapshot.following, currentFollowing) &&
    legacy.sameUsernameSet(latestStoredSnapshot.followers, currentFollowers);

  let confirmationSnapshot = latestStoredSnapshot;
  if (!isDuplicateSnapshot) {
    const capturedAt = NOW;
    const snapshot = {
      snapshot_id: `snapshot_${capturedAt}`,
      snapshot_date: capturedAt.slice(0, 10),
      captured_at: capturedAt,
      source_files: ["connections/following.json", ...followerFileNames.map(f => `connections/${f}`)],
      following: Object.fromEntries(following.map((item: any) => [item.username, item.timestamp ?? null])),
      followers: Object.fromEntries(followers.map((item: any) => [item.username, item.timestamp ?? null])),
      counts: {
        following: currentFollowing.size,
        followers: currentFollowers.size,
        mutual: mutual.length,
        not_following_back: notBack.length,
        followers_you_do_not_follow: followerOnly.length,
      },
      changes_from_previous_snapshot: {
        newly_following: newlyFollowing.map(key => next.accounts[key]?.username || key),
        stopped_following: stoppedFollowing.map(key => next.accounts[key]?.username || key),
        new_followers: newFollowers.map(key => next.accounts[key]?.username || key),
        lost_followers: lostFollowers.map(key => next.accounts[key]?.username || key),
      },
    };
    next.snapshots.push(snapshot);
    confirmationSnapshot = snapshot;
  }

  const confirmed = legacy.confirmPendingActions(next, confirmationSnapshot, NOW);
  return { next, isDuplicateSnapshot, confirmed };
}

/** The same master in the legacy app's format, so the legacy code can read it. */
function toLegacyMaster(master: Master): unknown {
  const actions: unknown[] = [];
  const accounts: Record<string, unknown> = {};
  const following: Record<string, null> = {};
  const followers: Record<string, null> = {};
  for (const [key, { actions: own, ...account }] of Object.entries(master.accounts)) {
    accounts[key] = { ...account, url: profileUrl(account.username) };
    if (account.current.you_follow) following[account.username] = null;
    if (account.current.follows_you) followers[account.username] = null;
    for (const [status, types] of [["pending", own.pending], ["confirmed", own.confirmed]] as const) {
      for (const type of types) {
        actions.push({
          action_id: `${status}_${type}_${key}`, username: account.username, type, status, marked_at: null, confirmed_at: null,
          cancelled_at: null, confirmation_snapshot_id: null, confirmation_snapshot_date: null, relationship_at_mark: null,
        });
      }
    }
  }
  return {
    schema_version: 6,
    tag_options: master.tag_options,
    accounts,
    actions,
    snapshots: [{
      snapshot_id: "snapshot_0",
      snapshot_date: master.last_import_at.slice(0, 10),
      captured_at: master.last_import_at,
      source_files: [],
      following,
      followers,
      changes_from_previous_snapshot: {
        newly_following: [],
        stopped_following: [],
        new_followers: Object.values(master.accounts).filter(a => a.follower_change === FOLLOWER_CHANGES.NEW).map(a => a.username),
        lost_followers: Object.values(master.accounts).filter(a => a.follower_change === FOLLOWER_CHANGES.LOST).map(a => a.username),
      },
    }],
  };
}

interface Projection {
  tag_options: string[];
  accounts: Record<string, unknown>;
  /** Follow graph and new/lost followers of the latest import. */
  graph: { following: string[]; followers: string[]; newFollowers: string[]; lostFollowers: string[] };
}

const sorted = (items: Iterable<string>) => [...new Set(items)].sort();
/** Snapshot membership by lower-cased username: legacy kept per-list casing, the new format one username per account. */
const sortedKeys = (names: Iterable<string>) => sorted([...names].map(name => name.toLowerCase()));

/** What both implementations must agree on, in a common shape. */
function projectNew(master: Master): Projection {
  const accounts = Object.entries(master.accounts);
  return {
    tag_options: master.tag_options,
    accounts: Object.fromEntries(accounts.map(([key, a]) => [key, {
      username: a.username, url: profileUrl(a.username), review: a.review, current: a.current,
      pending: sorted(a.actions.pending), confirmed: sorted(a.actions.confirmed),
    }])),
    graph: {
      following: sortedKeys(accounts.filter(([, a]) => a.current.you_follow).map(([, a]) => a.username)),
      followers: sortedKeys(accounts.filter(([, a]) => a.current.follows_you).map(([, a]) => a.username)),
      newFollowers: sortedKeys(accounts.filter(([, a]) => a.follower_change === FOLLOWER_CHANGES.NEW).map(([, a]) => a.username)),
      lostFollowers: sortedKeys(accounts.filter(([, a]) => a.follower_change === FOLLOWER_CHANGES.LOST).map(([, a]) => a.username)),
    },
  };
}

function projectLegacy(master: any): Projection {
  const actionsOf = (key: string, status: string) =>
    sorted((master.actions as any[]).filter(a => a.username.toLowerCase() === key && a.status === status).map(a => a.type as string));
  const latest = (master.snapshots as any[]).at(-1);
  return {
    tag_options: master.tag_options,
    accounts: Object.fromEntries(Object.entries(master.accounts as Record<string, any>).map(([key, a]) => [key, {
      username: a.username, url: a.url, review: a.review, current: a.current,
      pending: actionsOf(key, "pending"), confirmed: actionsOf(key, "confirmed"),
    }])),
    graph: {
      following: sortedKeys(Object.keys(latest.following)),
      followers: sortedKeys(Object.keys(latest.followers)),
      newFollowers: sortedKeys(latest.changes_from_previous_snapshot?.new_followers ?? []),
      lostFollowers: sortedKeys(latest.changes_from_previous_snapshot?.lost_followers ?? []),
    },
  };
}

function expectParity(name: string, raw: unknown, followingRaw: unknown, followerRaws: unknown[]) {
  const master = parseMaster(raw);
  const before = JSON.stringify(raw);
  const old = legacyImport(toLegacyMaster(master), followingRaw, followerRaws, followerRaws.map((_, i) => `followers_${i + 1}.json`));
  const result = importExport(raw, {
    following: parseFollowingJson(followingRaw),
    followers: followerRaws.flatMap(parseFollowersJson),
    followerFileCount: followerRaws.length,
  }, NOW);

  expect(JSON.stringify(raw), `${name}: input must not be mutated`).toBe(before);
  expect(JSON.parse(JSON.stringify(projectNew(result.master))), `${name}: master`).toEqual(JSON.parse(JSON.stringify(projectLegacy(old.next))));
  expect(result.exportChanged, `${name}: export changed`).toBe(!old.isDuplicateSnapshot);
  expect(result.confirmed, `${name}: confirmations`).toEqual(old.confirmed);
  return result;
}

describe("synthetic scenarios", () => {
  /** A saved v6 master: following a, b, c; followers a, d, e; with pending actions. */
  function savedMaster() {
    const first = importExport(null, {
      following: parseFollowingJson(followingFile(["a", 1], ["b", 2], ["c", 3])),
      followers: parseFollowersJson(followersFile(["a", 4], ["d", 5], ["e", 6])),
      followerFileCount: 1,
    }, "2026-10-01T00:00:00.000Z").master;
    for (const [name, type] of [["b", "unfollow"], ["c", "unfollow"], ["d", "remove_follower"], ["a", "remove_follower"]] as const) {
      first.accounts[name]?.actions.pending.push(type);
    }
    return JSON.parse(stringifyMasterFile(toMasterFile({ ...first, last_saved_at: "2026-10-01T00:00:00.000Z" }))) as unknown;
  }

  test("pending unfollow + follower removal confirmed, others stay pending; username casing updated", () => {
    // b unfollowed, d removed; c and a still present; "a" now spelled "A".
    const r = expectParity("changes", savedMaster(), followingFile(["A", 1], ["c", 3]), [followersFile(["a", 4], ["e", 6], ["f", 7])]);
    expect(r.confirmed).toEqual({ unfollow: 1, remove_follower: 1, total: 2 });
  });

  test("identical export changes nothing and confirms nothing", () => {
    const r = expectParity("dup", savedMaster(), followingFile(["a", 1], ["b", 2], ["c", 3]), [followersFile(["a", 4], ["d", 5], ["e", 6])]);
    expect(r.exportChanged).toBe(false);
    expect(r.confirmed.total).toBe(0);
  });

  test("follower chunks split across several files", () => {
    const r = expectParity("chunks", savedMaster(), followingFile(["a", 1]), [followersFile(["a", 4]), followersFile(["g", 8]), followersFile(["A", 9])]);
    expect(r.exportChanged).toBe(true);
  });
});

const realMasterPath = join(ROOT, "instagram_master_tracker.json");
const realData = existsSync(realMasterPath) && existsSync(join(ROOT, "connections/following.json"));

describe.skipIf(!realData)("your real data (local only)", () => {
  const read = (path: string): unknown => JSON.parse(readFileSync(join(ROOT, path), "utf8"));
  const followerNames = () => readdirSync(join(ROOT, "connections")).filter(n => /^followers_\d+\.json$/.test(n)).sort((a, b) => parseInt(a.slice(10)) - parseInt(b.slice(10)));

  test("current master + current export", () => {
    expectParity("real", read("instagram_master_tracker.json"), read("connections/following.json"), followerNames().map(n => read(`connections/${n}`)));
  });

  test("current master + export where every pending unfollow happened and 3 followers left", () => {
    const master = read("instagram_master_tracker.json");
    const pending = new Set(Object.entries(parseMaster(master).accounts).filter(([, a]) => a.actions.pending.includes("unfollow")).map(([key]) => key));
    expect(pending.size).toBeGreaterThan(0);
    const following = read("connections/following.json") as { relationships_following: { title: string }[] };
    following.relationships_following = following.relationships_following.filter(item => !pending.has(item.title.toLowerCase()));
    const followerRaws = followerNames().map(n => read(`connections/${n}`) as unknown[]);
    followerRaws[0] = (followerRaws[0] ?? []).slice(3);
    const r = expectParity("real+changes", master, following, followerRaws);
    expect(r.exportChanged).toBe(true);
    expect(r.confirmed.unfollow).toBe(pending.size);
  });
});
