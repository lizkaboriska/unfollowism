INSTAGRAM TRACKER — LOCALHOST PROJECT

PURPOSE
This is a local review/audit tool for Instagram Following and Followers exports.
It does not log into Instagram, use the Instagram API, scrape Instagram, or send
connection data to an external service.

Instagram export JSON files are the current source of relationship truth.
instagram_master_tracker.json stores your reusable review state, tags/notes,
relationship-change snapshots, and manual Instagram action history.

FOLDER STRUCTURE

unfollow/
  index.html                     the tracker UI
  app.js                         browser/UI wiring
  tracker-core.js                relationship, review, action, migration logic
  server.py                      localhost server + safe master persistence
  start.command
  instagram_master_tracker.json
  connections/
    following.json
    followers_1.json
    followers_2.json             optional; all followers_*.json are combined
    ...
  tests/
    tracker-core.test.js
    test_server.py
  archive/                       created automatically after the first Save
  instagram_json_framework_v10_auto_relative_paths.html
                                 LEGACY standalone page (old keep/unfollow
                                 decision model, followers_1.json only). Not
                                 used by index.html/server.py; do not use it to
                                 edit a schema v6 master.

USAGE
1. Replace connections/following.json with the fresh Instagram Following export.
2. Put ALL fresh Instagram follower chunks in connections/. Keep Instagram's
   names: followers_1.json, followers_2.json, followers_3.json, etc. Remove old
   extra followers_*.json files when replacing an export.
3. Start the tracker:
   - macOS: double-click start.command
   - CLI: python3 server.py
4. Open http://127.0.0.1:8000/ if it does not open automatically.
5. The app combines all followers_*.json files and compares the current sets
   with the latest relationship snapshot in the master.
6. Review/tag accounts and record any manual Instagram actions.
7. Click “Save changes” to make the current browser state permanent.
8. Stop the server with Control-C in Terminal.

Optional environment variables for server.py:
- INSTAGRAM_TRACKER_PORT=8001     use another port (default 8000)
- INSTAGRAM_TRACKER_NO_BROWSER=1  do not open the browser automatically

REVIEW MODEL (schema v6)
Review state and Instagram actions are intentionally separate.

Account review state:
- reviewed: whether this account currently needs another personal review
- last_reviewed_at: the last known time you marked it reviewed
- deleted_or_unavailable: your persistent account-level availability flag
- tags: persistent account classification such as artist, acquaintance, spam
- notes: persistent free-form notes

Important reset semantics:
- resetting a review should set only reviewed=false
- last_reviewed_at remains as useful history
- tags remain
- notes remain
- unavailable remains
- snapshots remain
- action history remains

Things that automatically mark an account reviewed (and set last_reviewed_at):
- checking Reviewed
- checking Unavailable
- checking an Instagram action (Unfollowed now / Removed follower)

The UI exposes “Reset scope”. It resets only accounts that are currently
reviewed and match the selected Scope + Tag. Search and the review-status
filter are intentionally ignored for reset targeting, and the UI shows the
exact affected count before applying the reset. After a reset the review-status
filter switches to Needs review. Reset is disabled on the snapshot change tabs.

REVIEW SCOPES
The current UI can audit overlapping parts of your Instagram graph:
- I follow: all accounts where you_follow=true
- People who follow me: all accounts where follows_you=true
- Mutual
- Not following back
- Follows me only
- All current accounts
- All accounts + history

Mutual accounts correctly belong to both “I follow” and “People who follow me”.
This overlap is deliberate: scopes are audit views, not mutually-exclusive
account categories.

Scopes combine with:
- review status: All / Needs review / Reviewed
- tag: All / Untagged / a specific tag
- username search

The compact review summary follows the selected scope + tag. Relationship count
pills (Following, Followers, Mutual, Not back, Followers only) stay global.

TAGS
Tags are persistent metadata and are independent from review freshness.
An account can be reset to Needs review while keeping all its tags.

For now, management of NEW tag names is intentionally not exposed in the UI.
New tag choices can be added manually to top-level tag_options in the master
JSON. During migration/load, any tag already attached to an account is
automatically merged into tag_options so manually-added account tags do not
become invisible in the UI.

ACTIONS
Actions represent things you manually did on Instagram. They are not review
“decisions”. Supported types are:

1. unfollow
   UI: “Unfollowed now”
   Available when the current snapshot says you follow the account.

2. remove_follower
   UI: “Removed follower”
   Available when the current snapshot says the account follows you.

A mutual account can therefore have either or both pending actions.

ACTION LIFECYCLE
Checking an action creates a pending entry in master.actions with:
- action_id
- username
- type
- status=pending
- marked_at
- relationship_at_mark

Unchecking a pending action marks it cancelled rather than deleting unrelated
review metadata.

A later imported snapshot confirms actions:
- unfollow confirms only when that username is in stopped_following and the
  current snapshot says you_follow=false
- remove_follower confirms only when that username is in lost_followers and the
  current snapshot says follows_you=false

Confirmation stores snapshot/date metadata in the action. Historical confirmed
actions never determine current review state, so an old unfollow cannot leak
into a later refollow/unfollow cycle.

If a legacy snapshot has only a calendar date and no captured_at timestamp,
confirmed_at remains null instead of inventing an exact time; the known
confirmation_snapshot_date is preserved.

SNAPSHOTS
- The master stores complete Following and Followers sets inside snapshots.
- A new snapshot is created only when either username set differs from the
  latest saved snapshot.
- Identical exports do not create an extra observation-only snapshot.
- New snapshots are created in browser memory first and are written only after
  you click Save changes.
- Change tabs (Followed since last snapshot, Unfollowed since last snapshot,
  New followers, New unfollowers) show newly_following, stopped_following,
  new_followers and lost_followers from the latest snapshot change set. On
  these tabs the Scope selector is disabled; review status, tag and search
  filters still apply.

PERSISTENCE / BACKUPS
- The master is the authoritative local database.
- Review edits, tags, notes, actions and unsaved snapshots are browser-memory
  changes until Save changes.
- Closing/refreshing the browser tab with unsaved work triggers a browser
  warning.
- The Refresh button reloads the project files and asks before discarding
  unsaved work.
- Every successful Save changes first copies the previous master into archive/
  using a timestamped filename, then atomically replaces the master.
- Backup downloads the current in-browser state as
  instagram_master_tracker_backup.json without changing the project master.

MASTER STRUCTURE (schema v6)
- accounts: current relationship + reusable review metadata
- snapshots: relationship-change snapshots and calculated changes
- actions: pending/cancelled/confirmed manual Instagram actions
- legacy_review_history: preserved older review-history data, if present

MIGRATION
Opening/reloading never writes to instagram_master_tracker.json. The current
master in this folder is already schema v6; the original older (schema v3)
master was archived into archive/ by the first save.

On load, the browser migrates older schemas to v6 in memory:
- old review.decision is removed
- old manual_unfollowed_now fields become pending unfollow actions
- old confirmed manual_unfollow actions become type=unfollow
- old current-cycle unfollow markers are removed from review state
- last_reviewed_at is added (null where an exact historical review time is not
  known)
- tags found on accounts are merged into tag_options
- schema/status metadata is updated

If the latest saved snapshot confirms a migrated pending unfollow, it is moved
to confirmed action history during load. The disk master changes only when you
explicitly click Save changes; server.py archives the old file first.

TESTING
Run JavaScript/core tests:
  node --test tests/tracker-core.test.js

Run Python/server tests:
  python3 -m unittest tests/test_server.py

The core tests cover:
- reusable review state + last_reviewed_at
- overlapping Following/Followers scopes
- reset-by-scope + tag semantics
- scope-specific review statistics
- pending/cancelled/confirmed unfollow actions
- follower-removal confirmation
- legacy v3/v5 migration into schema v6
- legacy date-only confirmation behavior
- tag option discovery
- multiple follower-file parsing/deduplication
- session-changes diff (net changes, per-tag grouping)

The server tests cover numeric ordering of followers_*.json discovery.

PROFILE REVIEW WINDOW
---------------------
A normal left-click on the large account/profile block opens Instagram in a compact
popup-style browser window so the tracker can remain visible beside it. Some browser/
Instagram combinations may create a fresh popup instead of reusing the previous one.
Ctrl/Cmd-click, Shift-click, Alt-click, and middle-click keep the browser's normal link
behavior for cases where you explicitly want another tab/window. If scripted popups
are blocked, the link falls back to normal new-tab behavior. The popup is a real
top-level Instagram page rather than an iframe.

UI / REVIEW WORKSPACE
---------------------
The interface is intentionally optimized for rapid review rather than displaying every
piece of project state as a dashboard. Global relationship counts are compact pills;
persistence/snapshot information lives in one status strip; filters are kept together;
and each account is rendered as a review card. The whole account block is the Instagram
click target, while Reviewed, Unavailable, tags, Instagram actions and notes stay grouped
nearby to reduce cursor travel during large review sessions.


SESSION CHANGES
---------------
The header includes an in-memory “Session changes” review drawer. A session starts after
project load has completed, including schema migration, current export merge, and any
automatic pending-action confirmations. Those automatic load-time changes are therefore
NOT counted as review-session edits.

The drawer compares the current working state with that loaded session baseline and shows
only meaningful NET differences:
- reviewed / sent back to review
- tags added / removed, including per-tag totals such as artist +7
- pending unfollow / follower-removal actions and action cancellations
- unavailable flag changes
- note edits
- persisted last-reviewed timestamp changes

The Session changes number is the number of accounts whose meaningful state differs from
the session baseline. One account can contain several individual changes, so the detailed
summary can contain more changes than the account count.

The drawer has All / Reviews / Tags / Actions tabs; unavailable, note and
last-reviewed changes appear under All.

Tag summary rows are clickable. Selecting e.g. artist +7 narrows the drawer to the accounts
that gained the artist tag in this session.

Session changes intentionally survive intermediate saves: Save changes writes the master
but does not replace the session baseline. Refreshing/reloading the project or reopening the
tracker starts a new session. The session comparison itself is not written into the master
and does not require a schema change.
