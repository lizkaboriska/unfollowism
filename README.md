# Instagram Review

Keep your Instagram following intentional, using your own Instagram data export:
see who you followed and who followed you since last time, tag the people you follow,
and keep a to-do list of accounts to unfollow or remove by hand.

Everything runs in your browser. Your files are never uploaded anywhere.

## How it works

You work in rounds. Each round:

1. **Get your export.** In Instagram, open **Accounts Center → Your information and permissions →
   Export your information** (called *Download your information* in some versions) → **Create export**,
   choose your profile, and select only **Followers and following**, date range **All time**
   (a shorter range leaves people out, and they would look unfollowed) and format **JSON**.
   It's usually ready within minutes to a few hours; then download the `.zip`.
2. **Import.** Open the app, then add the `.zip` (or `following.json` and every `followers_*.json`
   from it) **and the master file you saved last time**. Files can come from different folders:
   add them one after another. They are recognized by their content, so renaming them is fine.
3. **Review.** The tabs show:
   - **Review**: everyone, by scope (I follow, People who follow me, Mutual, …), status and tag.
   - **New follows**: people you followed since your last save.
   - **To do**: accounts you marked **To unfollow** or **To remove**. Do it on Instagram
     (the name opens their profile), then tick **Done**.
   - **I unfollowed / New followers / Lost followers**: what changed since your last save.

   Tag accounts, add notes, tick **Reviewed**.
4. **Save.** Click **Save master** to download `instagram_master_tracker_<date>.json`. That file
   is your record: keep it and add it to your next import. Saving also ends the round:
   "new" and "since your last save" count from it next time.

The next import checks your to-do list against the new export: accounts that are really gone
are cleared from it, and ones marked Done that are still there go back to To unfollow / To remove.

**Unsaved work:** the header shows **Unsaved changes (N)**; click it to see what isn't in your
downloaded master yet, or to undo it with **Reset changes**. A reload keeps your unsaved work,
but closing the tab does not, so save before you close.

## Development

Requires Node.js 22.13 or newer.

```sh
npm ci            # install dependencies
npm run dev       # start the dev server at http://localhost:5173 (hot reload)
```

| Command | What it does |
|---|---|
| `npm test` | Run all tests once |
| `npm run test:watch` | Re-run tests on change |
| `npm run test:perf` | Timing benchmark with 100k and 500k accounts |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |

### Project layout

```
src/
  core/        pure logic: parsing exports, merging, plans, change lists (no React)
  io/          reading zip/files, recognizing file types, download, browser storage
  store/       Redux Toolkit store, thunks, selectors
  ui/          React components and all user-facing wording
  App.tsx      the screens
legacy/        the previous version of the app, kept for comparison tests
```
