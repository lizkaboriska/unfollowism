const {
  SCHEMA_VERSION,
  STATUS_SEMANTICS,
  DEFAULT_TAG_OPTIONS,
  clone,
  usernameKey,
  createReview,
  ensureReview,
  markReviewed,
  parseFollowingJson,
  parseFollowersJson,
  dedupeAccounts,
  sameUsernameSet,
  syncCurrentRelationship,
  scopeMatches,
  tagMatches,
  reviewStatusMatches,
  relationshipStats,
  reviewScopeStats,
  resetReviewedForScope,
  pendingAction,
  addPendingAction,
  cancelPendingAction,
  confirmPendingActions,
  actionStats,
  buildSessionDiff,
  normalizeMaster
} = window.TrackerCore;

let activeChangeView = "current";
let hasUnsavedChanges = false;
let pendingSnapshotDetected = false;
let projectLoaded = false;
let loadedFollowerFiles = [];
let sessionBaseline = null;
let sessionActiveFilter = "all";
let sessionTagFocus = null;

let state = {
  schema_version: SCHEMA_VERSION,
  purpose: "Instagram following/follower review tracker",
  status_semantics: clone(STATUS_SEMANTICS),
  tag_options: clone(DEFAULT_TAG_OPTIONS),
  snapshots: [],
  actions: [],
  accounts: {}
};

const el = id => document.getElementById(id);
const esc = s => String(s ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
const nowIso = () => new Date().toISOString();

const INSTAGRAM_POPUP_NAME = "instagram-review-profile";

function instagramPopupFeatures() {
  const width = Math.min(520, Math.max(360, window.screen?.availWidth || 520));
  const height = Math.min(900, Math.max(640, window.screen?.availHeight || 900));
  const availLeft = Number(window.screen?.availLeft || 0);
  const availTop = Number(window.screen?.availTop || 0);
  const availWidth = Number(window.screen?.availWidth || width);
  const availHeight = Number(window.screen?.availHeight || height);
  const left = Math.max(availLeft, availLeft + availWidth - width - 16);
  const top = Math.max(availTop, availTop + Math.min(16, Math.max(0, availHeight - height)));

  return [
    "popup=yes",
    `width=${Math.round(width)}`,
    `height=${Math.round(height)}`,
    `left=${Math.round(left)}`,
    `top=${Math.round(top)}`,
    "resizable=yes",
    "scrollbars=yes"
  ].join(",");
}

function openInstagramReviewWindow(url) {
  const popup = window.open(url, INSTAGRAM_POPUP_NAME, instagramPopupFeatures());
  if (!popup) return false;

  try {
    popup.focus();
  } catch (_) {
    // Cross-origin pages may restrict direct window access; the popup is still usable.
  }

  return true;
}

function bindInstagramProfileLinks() {
  document.querySelectorAll("a[data-instagram-profile]").forEach(link => {
    link.addEventListener("click", event => {
      // Preserve standard browser gestures for opening a deliberate separate tab/window.
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const url = link.href;
      if (openInstagramReviewWindow(url)) event.preventDefault();
      // If a browser blocks scripted popups, the normal target=_blank navigation remains as fallback.
    });
  });
}

function accounts(sourceState = state) {
  return Object.values(sourceState.accounts || {});
}

function relationshipLabel(value) {
  return {
    mutual: "Mutual",
    not_following_back: "Not following back",
    follows_you_only: "Follows me only",
    neither: "Neither"
  }[value] || value;
}

function scopeLabel(value) {
  return {
    following: "I follow",
    followers: "People who follow me",
    mutual: "Mutual",
    not_following_back: "Not following back",
    follows_you_only: "Follows me only",
    all_current: "All current accounts",
    all_accounts: "All accounts + history"
  }[value] || value;
}

function changeViewLabel(value) {
  return {
    current: "Current review",
    followed_since: "Followed since last snapshot",
    unfollowed_since: "Unfollowed since last snapshot",
    new_followers: "New followers",
    new_unfollowers: "New unfollowers"
  }[value] || value;
}

function accountInitials(username) {
  const letters = String(username || "")
    .replace(/[^a-z0-9]/gi, "")
    .slice(0, 2)
    .toUpperCase();
  return letters || "IG";
}

function relationshipClass(value) {
  return ["mutual", "not_following_back", "follows_you_only", "neither"].includes(value) ? value : "neither";
}

function formatDateTime(value) {
  if (!value) return "Unknown";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString();
}

function formatDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleDateString();
}


function sessionDiff() {
  if (!projectLoaded || !sessionBaseline) {
    return {
      accounts: [],
      changedAccounts: 0,
      changeCount: 0,
      counts: {},
      summary: { reviews: 0, tags: 0, actions: 0, other: 0 },
      tagsAdded: [],
      tagsRemoved: []
    };
  }
  return buildSessionDiff(sessionBaseline, state);
}

function renderSessionButton() {
  const button = el("openSession");
  const count = el("sessionCount");
  if (!button || !count) return;
  const diff = sessionDiff();
  count.textContent = diff.changedAccounts;
  button.disabled = !projectLoaded;
  button.title = diff.changedAccounts
    ? `${diff.changedAccounts} account${diff.changedAccounts === 1 ? "" : "s"} changed in this session`
    : "No review changes in this session yet";
}

function sessionChangeSymbol(change) {
  if (change.category === "reviews") return { className: "review", symbol: change.type === "reviewed" ? "✓" : "↺" };
  if (change.category === "tags") return { className: "tag", symbol: change.type === "tag_added" ? "+" : "−" };
  if (change.category === "actions") return { className: "action", symbol: change.type === "action_cancelled" ? "×" : "↗" };
  return { className: "other", symbol: change.type === "note_edited" ? "✎" : "•" };
}

function renderSessionDrawer() {
  const body = el("sessionBody");
  const summary = el("sessionSummary");
  const subtitle = el("sessionSubtitle");
  if (!body || !summary || !subtitle) return;

  const diff = sessionDiff();
  summary.innerHTML = [
    ["reviews", diff.summary.reviews, "review changes"],
    ["tags", diff.summary.tags, "tag edits"],
    ["actions", diff.summary.actions, "Instagram actions"],
    ["other", diff.summary.other, "other changes"]
  ].map(([className, value, label]) =>
    `<div class="session-stat ${className}"><strong>${value}</strong><span>${esc(label)}</span></div>`
  ).join("");

  subtitle.textContent = diff.changedAccounts
    ? `${diff.changedAccounts} account${diff.changedAccounts === 1 ? "" : "s"} changed · ${diff.changeCount} net change${diff.changeCount === 1 ? "" : "s"}`
    : "Everything still matches the state loaded at the start of this session.";

  document.querySelectorAll(".session-tab").forEach(tab => {
    tab.classList.toggle("active", tab.dataset.sessionFilter === sessionActiveFilter);
  });

  if (!diff.changedAccounts) {
    body.innerHTML = '<div class="session-empty">No review changes in this session yet.</div>';
    return;
  }

  const showTags = sessionActiveFilter === "all" || sessionActiveFilter === "tags";
  const tagRows = [];
  if (showTags) {
    diff.tagsAdded.forEach(item => {
      tagRows.push(`<button type="button" class="session-tag-row" data-session-tag="${esc(item.tag)}" data-session-tag-mode="added"><span class="session-tag-label"><span class="session-tag-dot"></span>${esc(item.tag)}</span><span class="session-tag-count">+${item.count}</span></button>`);
    });
    diff.tagsRemoved.forEach(item => {
      tagRows.push(`<button type="button" class="session-tag-row removed" data-session-tag="${esc(item.tag)}" data-session-tag-mode="removed"><span class="session-tag-label"><span class="session-tag-dot"></span>${esc(item.tag)}</span><span class="session-tag-count">−${item.count}</span></button>`);
    });
  }

  let visibleAccounts = diff.accounts.map(entry => ({
    ...entry,
    changes: entry.changes.filter(change => {
      if (sessionActiveFilter !== "all" && change.category !== sessionActiveFilter) return false;
      if (!sessionTagFocus) return true;
      if (change.category !== "tags" || change.tag !== sessionTagFocus.tag) return false;
      return sessionTagFocus.mode === "added" ? change.type === "tag_added" : change.type === "tag_removed";
    })
  })).filter(entry => entry.changes.length);

  const tagFocusText = sessionTagFocus
    ? ` · showing ${sessionTagFocus.mode === "added" ? "added" : "removed"} “${sessionTagFocus.tag}”`
    : "";

  const changeCards = visibleAccounts.map(entry => {
    const lines = entry.changes.map(change => {
      const symbol = sessionChangeSymbol(change);
      const label = change.tag
        ? `${change.type === "tag_added" ? "Added" : "Removed"} tag <strong>${esc(change.tag)}</strong>`
        : esc(change.label);
      return `<div class="session-change-line"><span class="session-change-symbol ${symbol.className}">${esc(symbol.symbol)}</span><span>${label}</span></div>`;
    }).join("");
    return `<div class="session-change-card"><div class="session-change-user">@${esc(entry.username)}</div><div class="session-change-lines">${lines}</div></div>`;
  }).join("");

  body.innerHTML = `${tagRows.length ? `<div class="session-section-title"><h3>Tag changes</h3><span>${diff.counts.tagsAdded || 0} added · ${diff.counts.tagsRemoved || 0} removed</span></div><div class="session-tag-summary">${tagRows.join("")}</div>` : ""}<div class="session-section-title"><h3>Changes</h3><span>${visibleAccounts.length} account${visibleAccounts.length === 1 ? "" : "s"}${esc(tagFocusText)}</span></div>${changeCards ? `<div class="session-change-list">${changeCards}</div>` : '<div class="session-empty">No changes match this session filter.</div>'}`;

  document.querySelectorAll("[data-session-tag]").forEach(button => {
    button.addEventListener("click", () => {
      sessionActiveFilter = "tags";
      sessionTagFocus = { tag: button.dataset.sessionTag, mode: button.dataset.sessionTagMode };
      renderSessionDrawer();
    });
  });
}

function openSessionDrawer() {
  if (!projectLoaded) return;
  sessionActiveFilter = "all";
  sessionTagFocus = null;
  renderSessionDrawer();
  const overlay = el("sessionOverlay");
  overlay.classList.add("open");
  overlay.setAttribute("aria-hidden", "false");
}

function closeSessionDrawer() {
  const overlay = el("sessionOverlay");
  if (!overlay) return;
  overlay.classList.remove("open");
  overlay.setAttribute("aria-hidden", "true");
}

function renderPersistenceStatus() {
  const saveState = el("saveState");
  const snapshotStatus = el("snapshotStatus");
  const lastSaved = el("lastSaved");
  const saveButton = el("saveMaster");

  if (saveState) {
    saveState.textContent = hasUnsavedChanges ? "Unsaved changes" : (projectLoaded ? "Saved" : "Not loaded");
    saveState.classList.toggle("warn", hasUnsavedChanges);
    saveState.classList.toggle("ok", projectLoaded && !hasUnsavedChanges);
  }

  if (snapshotStatus) {
    snapshotStatus.textContent = pendingSnapshotDetected
      ? "New snapshot detected — not saved"
      : (projectLoaded ? "Connection files match latest saved snapshot" : "Waiting for project files");
    snapshotStatus.classList.toggle("warn", pendingSnapshotDetected);
    snapshotStatus.classList.toggle("ok", projectLoaded && !pendingSnapshotDetected);
  }

  if (lastSaved) lastSaved.textContent = state.last_saved_at ? formatDateTime(state.last_saved_at) : "Unknown";
  if (saveButton) saveButton.disabled = !projectLoaded || !hasUnsavedChanges;
  const sessionSave = el("saveFromSession");
  if (sessionSave) sessionSave.disabled = !projectLoaded || !hasUnsavedChanges;
  renderSessionButton();
}

function setDirty(value = true) {
  hasUnsavedChanges = !!value;
  renderPersistenceStatus();
}

function currentReviewScope() {
  return el("scopeFilter")?.value || "following";
}

function currentTagFilter() {
  return el("tagFilter")?.value || "";
}

function renderStats() {
  const relationships = relationshipStats(state);
  const scope = currentReviewScope();
  const tag = currentTagFilter();
  const review = reviewScopeStats(state, { scope, tag });
  const actions = actionStats(state);
  const scopeName = tag ? `${scopeLabel(scope)} · ${tag === "untagged" ? "untagged" : tag}` : scopeLabel(scope);

  el("stats").innerHTML = [
    ["following", "Following", relationships.following],
    ["followers", "Followers", relationships.followers],
    ["mutual", "Mutual", relationships.mutual],
    ["notback", "Not back", relationships.notFollowingBack],
    ["only", "Followers only", relationships.followsYouOnly]
  ].map(([className, label, value]) =>
    `<div class="stat ${className}"><b>${value}</b><span>${esc(label)}</span></div>`
  ).join("");

  const pendingTotal = actions.pendingUnfollow + actions.pendingRemoveFollower;
  const pendingText = pendingTotal ? ` · ${pendingTotal} pending action${pendingTotal === 1 ? "" : "s"}` : "";
  const summary = el("reviewScopeSummary");
  if (summary) {
    summary.innerHTML = activeChangeView === "current"
      ? `<strong>${review.needsReview}</strong> need review · ${review.reviewed} reviewed · ${review.total} in ${esc(scopeName)}${pendingText}`
      : `${esc(changeViewLabel(activeChangeView))}${pendingText}`;
  }
}

function renderTagFilter() {
  const tagFilter = el("tagFilter");
  const current = tagFilter.value;
  const tags = state.tag_options || [];
  tagFilter.innerHTML = '<option value="">All tags</option><option value="untagged">Untagged</option>' +
    tags.map(tag => `<option value="${esc(tag)}">${esc(tag)}</option>`).join("");
  if ([...tagFilter.options].some(option => option.value === current)) tagFilter.value = current;
}

function latestSnapshot() {
  return state.snapshots?.[state.snapshots.length - 1] || null;
}

function changedUsernameSet() {
  if (activeChangeView === "current") return null;
  const changes = latestSnapshot()?.changes_from_previous_snapshot || {};
  let list = [];
  if (activeChangeView === "followed_since") list = changes.newly_following || [];
  if (activeChangeView === "unfollowed_since") list = changes.stopped_following || [];
  if (activeChangeView === "new_followers") list = changes.new_followers || [];
  if (activeChangeView === "new_unfollowers") list = changes.lost_followers || [];
  return new Set(list.map(usernameKey));
}

function lastConfirmedAction(username, type) {
  const key = usernameKey(username);
  return [...(state.actions || [])].reverse().find(action =>
    action.type === type && action.status === "confirmed" && usernameKey(action.username) === key
  ) || null;
}

function renderRows() {
  const rowsEl = el("rows");
  if (!state.accounts || !Object.keys(state.accounts).length) {
    rowsEl.innerHTML = '<div class="empty-state">No data loaded yet. The tracker is waiting for the project files.</div>';
    return;
  }

  const query = el("search").value.trim().toLowerCase();
  const scope = currentReviewScope();
  const reviewFilter = el("reviewFilter").value;
  const tagFilter = currentTagFilter();
  const changedUsers = changedUsernameSet();

  const rows = accounts().filter(account => {
    if (changedUsers && !changedUsers.has(usernameKey(account.username))) return false;
    if (activeChangeView === "current" && !scopeMatches(account, scope)) return false;
    if (!reviewStatusMatches(account, reviewFilter)) return false;
    if (!tagMatches(account, tagFilter)) return false;
    if (query && !usernameKey(account.username).includes(query)) return false;
    return true;
  }).sort((a, b) => String(a.username).localeCompare(String(b.username)));

  const summary = el("reviewScopeSummary");
  if (summary && activeChangeView !== "current") {
    summary.innerHTML = `<strong>${rows.length}</strong> account${rows.length === 1 ? "" : "s"} · ${esc(changeViewLabel(activeChangeView))}`;
  }

  if (!rows.length) {
    rowsEl.innerHTML = '<div class="empty-state">No accounts match the current filters.</div>';
    return;
  }

  rowsEl.innerHTML = rows.map(account => {
    const review = ensureReview(account);
    const tags = state.tag_options || [];
    const pendingUnfollow = pendingAction(state, account.username, "unfollow");
    const pendingRemoveFollower = pendingAction(state, account.username, "remove_follower");
    const confirmedUnfollow = lastConfirmedAction(account.username, "unfollow");
    const confirmedRemoveFollower = lastConfirmedAction(account.username, "remove_follower");
    const relationship = relationshipClass(account.current?.relationship || "neither");
    const followingDate = account.current?.following_since_timestamp
      ? new Date(account.current.following_since_timestamp * 1000).toISOString().slice(0, 10)
      : "";
    const followerDate = account.current?.follower_since_timestamp
      ? new Date(account.current.follower_since_timestamp * 1000).toISOString().slice(0, 10)
      : "";

    const sinceParts = [];
    if (followingDate && account.current?.you_follow) sinceParts.push(`You followed ${followingDate}`);
    if (followerDate && account.current?.follows_you) sinceParts.push(`Followed you ${followerDate}`);

    const history = [
      confirmedUnfollow
        ? `<span class="history-chip">Unfollow confirmed${confirmedUnfollow.confirmation_snapshot_date ? ` · ${esc(confirmedUnfollow.confirmation_snapshot_date)}` : ""}</span>`
        : "",
      confirmedRemoveFollower
        ? `<span class="history-chip">Removal confirmed${confirmedRemoveFollower.confirmation_snapshot_date ? ` · ${esc(confirmedRemoveFollower.confirmation_snapshot_date)}` : ""}</span>`
        : ""
    ].filter(Boolean).join("");

    const actionControls = [
      (account.current?.you_follow || pendingUnfollow)
        ? `<label class="checkpill actionpill ${pendingUnfollow ? "reviewed-on" : ""}"><input type="checkbox" data-user="${esc(account.username)}" data-action-type="unfollow" ${pendingUnfollow ? "checked" : ""}> Unfollowed now</label>`
        : "",
      (account.current?.follows_you || pendingRemoveFollower)
        ? `<label class="checkpill actionpill remove ${pendingRemoveFollower ? "reviewed-on" : ""}"><input type="checkbox" data-user="${esc(account.username)}" data-action-type="remove_follower" ${pendingRemoveFollower ? "checked" : ""}> Removed follower</label>`
        : ""
    ].filter(Boolean).join("");

    return `<article class="person rel-${relationship} ${review.deleted_or_unavailable ? "dim" : ""}">
      <div class="profilezone">
        <a class="profilelink" href="${esc(account.url)}" target="_blank" rel="noopener noreferrer" data-instagram-profile>
          <div class="avatar" aria-hidden="true">${esc(accountInitials(account.username))}</div>
          <div class="identity">
            <div class="username">@${esc(account.username)}</div>
            <div class="openhint">Open Instagram ↗</div>
            <div class="chips">
              <span class="chip ${relationship}">${esc(relationshipLabel(relationship))}</span>
              ${review.deleted_or_unavailable ? '<span class="chip unavailable">Unavailable</span>' : ""}
            </div>
          </div>
        </a>
        <div class="profile-meta">
          ${sinceParts.length ? sinceParts.map(esc).join("<br>") : "No relationship date in export"}<br>
          Last reviewed: ${esc(formatDate(review.last_reviewed_at))}
        </div>
      </div>

      <div class="workspace">
        <div class="quickrow">
          <label class="checkpill ${review.reviewed ? "reviewed-on" : ""}"><input type="checkbox" data-user="${esc(account.username)}" data-review-field="reviewed" ${review.reviewed ? "checked" : ""}> Reviewed</label>
          <label class="checkpill ${review.deleted_or_unavailable ? "unavailable-on" : ""}"><input type="checkbox" data-user="${esc(account.username)}" data-review-field="deleted_or_unavailable" ${review.deleted_or_unavailable ? "checked" : ""}> Unavailable</label>
          ${actionControls}
        </div>

        <div class="tagbox" aria-label="Tags for ${esc(account.username)}">
          ${tags.map(tag => `<button type="button" class="tagbtn ${(review.tags || []).includes(tag) ? "on" : ""}" data-user="${esc(account.username)}" data-tag="${esc(tag)}">${esc(tag)}</button>`).join("")}
        </div>

        <div class="secondaryrow">
          <input class="note" type="text" data-note-user="${esc(account.username)}" value="${esc(review.notes || "")}" placeholder="Add note…" aria-label="Note for ${esc(account.username)}">
          ${history ? `<div class="action-history">${history}</div>` : ""}
        </div>
      </div>
    </article>`;
  }).join("");

  bindInstagramProfileLinks();

  document.querySelectorAll("input[data-review-field]").forEach(input => {
    input.addEventListener("change", () => {
      const account = state.accounts[usernameKey(input.dataset.user)];
      const review = ensureReview(account);
      const field = input.dataset.reviewField;

      if (field === "reviewed") {
        markReviewed(account, input.checked, nowIso());
      } else if (field === "deleted_or_unavailable") {
        review.deleted_or_unavailable = input.checked;
        if (input.checked) markReviewed(account, true, nowIso());
      }

      setDirty(true);
      renderStats();
      renderRows();
    });
  });

  document.querySelectorAll("input[data-action-type]").forEach(input => {
    input.addEventListener("change", () => {
      const account = state.accounts[usernameKey(input.dataset.user)];
      const type = input.dataset.actionType;
      try {
        if (input.checked) {
          addPendingAction(state, account, type, nowIso());
          markReviewed(account, true, nowIso());
        } else {
          cancelPendingAction(state, account.username, type, nowIso());
        }
        setDirty(true);
        renderStats();
        renderRows();
      } catch (error) {
        alert(error.message);
        renderRows();
      }
    });
  });

  document.querySelectorAll(".tagbtn").forEach(button => {
    button.addEventListener("click", () => {
      const account = state.accounts[usernameKey(button.dataset.user)];
      const review = ensureReview(account);
      const tags = new Set(review.tags || []);
      if (tags.has(button.dataset.tag)) tags.delete(button.dataset.tag);
      else tags.add(button.dataset.tag);
      review.tags = [...tags];
      setDirty(true);
      renderStats();
      renderRows();
    });
  });

  document.querySelectorAll("[data-note-user]").forEach(input => {
    input.addEventListener("input", () => {
      const account = state.accounts[usernameKey(input.dataset.noteUser)];
      ensureReview(account).notes = input.value;
      setDirty(true);
    });
  });
}

function render() {
  renderTagFilter();
  renderStats();
  renderRows();
  renderPersistenceStatus();
}

async function fetchJson(path) {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
}

async function loadFollowerFiles() {
  const manifest = await fetchJson("./api/connection-files");
  const followerFiles = Array.isArray(manifest.followers) ? manifest.followers : [];
  if (!followerFiles.length) throw new Error("No followers_*.json files found in ./connections/.");

  const rawFiles = await Promise.all(
    followerFiles.map(filename => fetchJson(`./connections/${encodeURIComponent(filename)}`))
  );

  return {
    files: followerFiles,
    followers: dedupeAccounts(rawFiles.flatMap(parseFollowersJson))
  };
}

async function loadProject() {
  const message = el("mergeMessage");
  sessionBaseline = null;
  renderSessionButton();
  message.textContent = "Loading project files…";

  try {
    const [oldMaster, followingRaw, followerBundle] = await Promise.all([
      fetchJson("./instagram_master_tracker.json"),
      fetchJson("./connections/following.json"),
      loadFollowerFiles()
    ]);

    if (!oldMaster.accounts || typeof oldMaster.accounts !== "object") {
      throw new Error("instagram_master_tracker.json is not compatible.");
    }

    const following = dedupeAccounts(parseFollowingJson(followingRaw));
    const followers = followerBundle.followers;
    loadedFollowerFiles = followerBundle.files;

    if (!following.length) throw new Error("No accounts found in ./connections/following.json.");
    if (!followers.length) throw new Error(`No accounts found in ${loadedFollowerFiles.join(", ")}.`);

    const normalized = normalizeMaster(oldMaster);
    const next = normalized.next;
    const latestStoredSnapshot = next.snapshots.length ? next.snapshots[next.snapshots.length - 1] : null;
    const previousFollowing = new Set(
      latestStoredSnapshot ? Object.keys(latestStoredSnapshot.following || {}).map(usernameKey) : []
    );
    const previousFollowers = new Set(
      latestStoredSnapshot ? Object.keys(latestStoredSnapshot.followers || {}).map(usernameKey) : []
    );

    const followingMap = new Map(following.map(item => [usernameKey(item.username), item]));
    const followersMap = new Map(followers.map(item => [usernameKey(item.username), item]));
    const currentFollowing = new Set(followingMap.keys());
    const currentFollowers = new Set(followersMap.keys());
    const allKeys = new Set([
      ...Object.keys(next.accounts).map(usernameKey),
      ...currentFollowing,
      ...currentFollowers
    ]);

    for (const key of allKeys) {
      let account = next.accounts[key];
      const followingItem = followingMap.get(key);
      const followerItem = followersMap.get(key);

      if (!account) {
        const sourceItem = followingItem || followerItem;
        const username = sourceItem.username;
        account = next.accounts[key] = {
          username,
          url: sourceItem.url || `https://www.instagram.com/${username}`,
          review: createReview(),
          current: {}
        };
      }

      ensureReview(account);

      if (followingItem) {
        account.username = followingItem.username;
        account.url = followingItem.url || account.url;
      } else if (followerItem) {
        account.username = followerItem.username;
        account.url = followerItem.url || account.url;
      }

      syncCurrentRelationship(account, followingItem, followerItem);
    }

    const mutual = [...currentFollowing].filter(key => currentFollowers.has(key));
    const notBack = [...currentFollowing].filter(key => !currentFollowers.has(key));
    const followerOnly = [...currentFollowers].filter(key => !currentFollowing.has(key));
    const newlyFollowing = [...currentFollowing].filter(key => !previousFollowing.has(key));
    const stoppedFollowing = [...previousFollowing].filter(key => !currentFollowing.has(key));
    const newFollowers = [...currentFollowers].filter(key => !previousFollowers.has(key));
    const lostFollowers = [...previousFollowers].filter(key => !currentFollowers.has(key));

    const isDuplicateSnapshot = !!latestStoredSnapshot &&
      sameUsernameSet(latestStoredSnapshot.following, currentFollowing) &&
      sameUsernameSet(latestStoredSnapshot.followers, currentFollowers);

    let confirmationSnapshot = latestStoredSnapshot;

    if (!isDuplicateSnapshot) {
      const capturedAt = nowIso();
      const sourceFiles = [
        "connections/following.json",
        ...loadedFollowerFiles.map(filename => `connections/${filename}`)
      ];
      const snapshot = {
        snapshot_id: `snapshot_${capturedAt}`,
        snapshot_date: capturedAt.slice(0, 10),
        captured_at: capturedAt,
        source_files: sourceFiles,
        following: Object.fromEntries(following.map(item => [item.username, item.timestamp ?? null])),
        followers: Object.fromEntries(followers.map(item => [item.username, item.timestamp ?? null])),
        counts: {
          following: currentFollowing.size,
          followers: currentFollowers.size,
          mutual: mutual.length,
          not_following_back: notBack.length,
          followers_you_do_not_follow: followerOnly.length
        },
        changes_from_previous_snapshot: {
          newly_following: newlyFollowing.map(key => next.accounts[key]?.username || key),
          stopped_following: stoppedFollowing.map(key => next.accounts[key]?.username || key),
          new_followers: newFollowers.map(key => next.accounts[key]?.username || key),
          lost_followers: lostFollowers.map(key => next.accounts[key]?.username || key)
        }
      };
      next.snapshots.push(snapshot);
      confirmationSnapshot = snapshot;
    }

    const confirmed = confirmPendingActions(next, confirmationSnapshot, nowIso());

    state = next;
    projectLoaded = true;
    sessionBaseline = clone(next);
    pendingSnapshotDetected = !isDuplicateSnapshot;
    setDirty(normalized.changed || !isDuplicateSnapshot || confirmed.total > 0);
    render();

    const followerFileText = `${loadedFollowerFiles.length} follower file${loadedFollowerFiles.length === 1 ? "" : "s"}`;
    const confirmationText = confirmed.total
      ? ` Confirmed ${confirmed.unfollow} unfollow${confirmed.unfollow === 1 ? "" : "s"} and ${confirmed.remove_follower} follower removal${confirmed.remove_follower === 1 ? "" : "s"}.`
      : "";

    if (!isDuplicateSnapshot) {
      message.textContent =
        `New snapshot detected — not saved. Loaded ${followerFileText}. ${currentFollowing.size} following, ${currentFollowers.size} followers. ` +
        `Changes: +${newlyFollowing.length} following, -${stoppedFollowing.length} following, ` +
        `+${newFollowers.length} followers, -${lostFollowers.length} followers.` + confirmationText;
    } else if (confirmed.total) {
      message.textContent =
        `Project loaded from ${followerFileText}. Connection files match the latest snapshot.${confirmationText} Save master to keep the migrated action history.`;
    } else if (normalized.changed) {
      message.textContent = `Project loaded from ${followerFileText} and migrated to schema v${SCHEMA_VERSION}. Save master to keep the migration.`;
    } else {
      const existingChanges = latestStoredSnapshot?.changes_from_previous_snapshot || {};
      message.textContent =
        `Project loaded from ${followerFileText} and up to date. Latest saved changes: ` +
        `+${(existingChanges.newly_following || []).length} following, ` +
        `-${(existingChanges.stopped_following || []).length} following, ` +
        `+${(existingChanges.new_followers || []).length} followers, ` +
        `-${(existingChanges.lost_followers || []).length} followers.`;
    }
  } catch (error) {
    projectLoaded = false;
    message.textContent = "Could not load project files: " + error.message + ". Start the project with start.command or python3 server.py.";
    renderPersistenceStatus();
  }
}

async function reloadProjectWithWarning() {
  if (hasUnsavedChanges) {
    const okay = window.confirm("Reloading will discard all unsaved review/action changes and any unsaved snapshot. Continue?");
    if (!okay) return;
  }
  await loadProject();
}

function prepareStateForSave() {
  if (!state.accounts || !Object.keys(state.accounts).length) {
    throw new Error("Nothing to save yet. The project files have not loaded successfully.");
  }

  accounts().forEach(account => ensureReview(account));
  state.schema_version = SCHEMA_VERSION;
  state.status_semantics = clone(STATUS_SEMANTICS);
  state.exported_at = nowIso();
  state.last_updated_at = state.exported_at;
}

el("reloadProject").addEventListener("click", reloadProjectWithWarning);
window.addEventListener("DOMContentLoaded", loadProject);

el("saveMaster").addEventListener("click", async () => {
  const message = el("mergeMessage");
  if (!hasUnsavedChanges) {
    message.textContent = "No unsaved changes.";
    return;
  }

  try {
    prepareStateForSave();
    const response = await fetch("./api/save-master", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state, null, 2)
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || `Save failed (${response.status})`);

    if (result.saved_at) {
      state.last_saved_at = result.saved_at;
      state.last_updated_at = result.saved_at;
    }
    pendingSnapshotDetected = false;
    setDirty(false);
    renderStats();

    message.textContent = result.backup
      ? `Master saved. Previous master archived as ${result.backup}.`
      : "Master saved to instagram_master_tracker.json.";
  } catch (error) {
    setDirty(true);
    message.textContent = "Could not save master: " + error.message;
  }
});

el("exportJson").addEventListener("click", () => {
  if (!state.accounts || !Object.keys(state.accounts).length) {
    alert("Nothing to export yet. The project files have not loaded successfully.");
    return;
  }

  const backupState = clone(state);
  backupState.exported_at = nowIso();
  const blob = new Blob([JSON.stringify(backupState, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "instagram_master_tracker_backup.json";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
});

el("search").addEventListener("input", renderRows);
["scopeFilter", "reviewFilter", "tagFilter"].forEach(id => {
  el(id).addEventListener("change", () => {
    renderStats();
    renderRows();
  });
});

el("resetReviewed").addEventListener("click", () => {
  if (activeChangeView !== "current") return;
  const scope = currentReviewScope();
  const tag = currentTagFilter();
  const stats = reviewScopeStats(state, { scope, tag });
  const count = stats.reviewed;
  if (!count) {
    alert("There are no reviewed accounts to reset in this scope.");
    return;
  }

  const label = tag
    ? `${scopeLabel(scope)} + ${tag === "untagged" ? "untagged" : tag}`
    : scopeLabel(scope);
  const okay = window.confirm(
    `Reset reviewed for ${count} account${count === 1 ? "" : "s"} matching ${label}?\n\n` +
    "Tags, notes, last-reviewed date, availability flags, snapshots, and action history will be preserved."
  );
  if (!okay) return;

  resetReviewedForScope(state, { scope, tag });
  el("reviewFilter").value = "needs_review";
  setDirty(true);
  renderStats();
  renderRows();
});

document.querySelectorAll(".changeTab").forEach(button => {
  button.addEventListener("click", () => {
    activeChangeView = button.dataset.changeView;
    document.querySelectorAll(".changeTab").forEach(item => item.classList.toggle("active", item === button));
    el("scopeFilter").disabled = activeChangeView !== "current";
    el("resetReviewed").disabled = activeChangeView !== "current";
    renderStats();
    renderRows();
  });
});


el("openSession").addEventListener("click", openSessionDrawer);
el("closeSession").addEventListener("click", closeSessionDrawer);
el("closeSessionBottom").addEventListener("click", closeSessionDrawer);
el("saveFromSession").addEventListener("click", () => el("saveMaster").click());
el("sessionOverlay").addEventListener("click", event => {
  if (event.target === el("sessionOverlay")) closeSessionDrawer();
});
document.querySelectorAll(".session-tab").forEach(tab => {
  tab.addEventListener("click", () => {
    sessionActiveFilter = tab.dataset.sessionFilter;
    sessionTagFocus = null;
    renderSessionDrawer();
  });
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape" && el("sessionOverlay")?.classList.contains("open")) closeSessionDrawer();
});

window.addEventListener("beforeunload", event => {
  if (!hasUnsavedChanges) return;
  event.preventDefault();
  event.returnValue = "";
});

render();
