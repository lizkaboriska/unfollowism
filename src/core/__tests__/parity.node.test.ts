// @vitest-environment node
/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any */
// Parity referee: the same inputs go through the legacy implementation
// (legacy/tracker-core.js + the merge part of legacy/app.js loadProject, transcribed
// below) and through importExport(). The resulting master JSON must be byte-identical.
import { createRequire } from "node:module";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { importExport, parseFollowersJson, parseFollowingJson } from "../index.ts";
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
  return { next, changed: normalized.changed as boolean, isDuplicateSnapshot, confirmed };
}

function expectParity(name: string, master: unknown, followingRaw: unknown, followerRaws: unknown[]) {
  const followerFileNames = followerRaws.map((_, i) => `followers_${i + 1}.json`);
  const before = JSON.stringify(master);
  const old = legacyImport(structuredClone(master), followingRaw, followerRaws, followerFileNames);
  const result = importExport(master, {
    following: parseFollowingJson(followingRaw),
    followers: followerRaws.flatMap(parseFollowersJson),
    sourceFiles: ["connections/following.json", ...followerFileNames.map(f => `connections/${f}`)],
    followerFileCount: followerRaws.length,
  }, NOW);

  expect(JSON.stringify(master), `${name}: input must not be mutated`).toBe(before);
  expect(JSON.stringify(result.master, null, 2), `${name}: master JSON`).toBe(JSON.stringify(old.next, null, 2));
  expect(result.migrated, `${name}: migrated flag`).toBe(old.changed);
  expect(result.snapshotCreated, `${name}: snapshot`).toBe(!old.isDuplicateSnapshot);
  expect(result.confirmed, `${name}: confirmations`).toEqual(old.confirmed);
  return result;
}

describe("synthetic scenarios", () => {
  const v3Master = {
    schema_version: 3,
    purpose: "Instagram following/follower review tracker",
    tag_options: ["artist"],
    review_history: [{ review_date: "2026-01-01", type: "x", source: "y", counts: {} }],
    accounts: {
      Alice: { username: "Alice", url: "https://www.instagram.com/Alice", review: { reviewed: true, decision: "keep", tags: ["artist", " friend "], notes: "n", manual_unfollowed_now: false, deleted_or_unavailable: false }, current: { you_follow: true, follows_you: true, relationship: "mutual", following_since_timestamp: 1, follower_since_timestamp: 2 } },
      bob: { username: "bob", url: "https://www.instagram.com/bob", review: { reviewed: false, tags: [], notes: "", manual_unfollowed_now: true, deleted_or_unavailable: false }, current: { you_follow: true, follows_you: false, relationship: "not_following_back", following_since_timestamp: 1, follower_since_timestamp: null } },
    },
    snapshots: [{
      snapshot_date: "2026-01-01",
      source_files: [],
      following: { Alice: 1, bob: 1 },
      followers: { Alice: 2 },
      counts: { following: 2, followers: 1, mutual: 1, not_following_back: 1, followers_you_do_not_follow: 0 },
    }],
    last_updated_at: "2026-01-01T00:00:00Z",
  };

  test("v3 master migrates; bob's legacy unfollow is confirmed by the new export", () => {
    const r = expectParity("v3", v3Master, followingFile(["alice", 5], ["carol", 6]), [followersFile(["Alice", 2]), followersFile(["dave", 9])]);
    expect(r.snapshotCreated).toBe(true);
    expect(r.confirmed.unfollow).toBe(1);
  });

  test("identical export creates no snapshot", () => {
    const r = expectParity("dup", v3Master, followingFile(["Alice", 1], ["bob", 1]), [followersFile(["Alice", 2])]);
    expect(r.snapshotCreated).toBe(false);
  });

  test("v6 master: pending unfollow + follower removal confirmed, others stay pending", () => {
    const first = importExport(null, {
      following: parseFollowingJson(followingFile(["a"], ["b"], ["c"])),
      followers: parseFollowersJson(followersFile(["a"], ["d"], ["e"])),
      sourceFiles: ["following.json", "followers_1.json"],
      followerFileCount: 1,
    }, "2026-10-01T00:00:00.000Z").master;
    const saved = JSON.parse(JSON.stringify(first)) as typeof first;
    for (const [name, type] of [["b", "unfollow"], ["c", "unfollow"], ["d", "remove_follower"], ["a", "remove_follower"]] as const) {
      saved.actions.push({
        action_id: `action_${type}_${name}`, username: name, type, status: "pending", marked_at: "2026-10-02T00:00:00.000Z",
        confirmed_at: null, cancelled_at: null, confirmation_snapshot_id: null, confirmation_snapshot_date: null,
        relationship_at_mark: { you_follow: true, follows_you: true },
      });
    }
    // b unfollowed, d removed; c and a still present.
    const r = expectParity("v6", saved, followingFile(["A"], ["c"]), [followersFile(["a"], ["e"], ["f"])]);
    expect(r.confirmed).toEqual({ unfollow: 1, remove_follower: 1, total: 2 });
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

  test.each(existsSync(join(ROOT, "archive")) ? readdirSync(join(ROOT, "archive")).filter(n => n.endsWith(".json")) : [])("archived master %s + current export", name => {
    expectParity(`archive ${name}`, read(`archive/${name}`), read("connections/following.json"), followerNames().map(n => read(`connections/${n}`)));
  });

  test("current master + export where every pending unfollow happened and 3 followers left", () => {
    const master = read("instagram_master_tracker.json") as { actions: { status: string; type: string; username: string }[] };
    const pending = new Set(master.actions.filter(a => a.status === "pending" && a.type === "unfollow").map(a => a.username.toLowerCase()));
    const following = read("connections/following.json") as { relationships_following: { title: string }[] };
    following.relationships_following = following.relationships_following.filter(item => !pending.has(item.title.toLowerCase()));
    const followerRaws = followerNames().map(n => read(`connections/${n}`) as unknown[]);
    followerRaws[0] = (followerRaws[0] ?? []).slice(3);
    const r = expectParity("real+changes", master, following, followerRaws);
    expect(r.snapshotCreated).toBe(true);
  });
});
