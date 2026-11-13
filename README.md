# Unfollowism

Keep your Instagram following intentional, using your own Instagram data export:
see who you followed and who followed you since last time, tag the people you follow,
and keep a to-do list of accounts to unfollow or remove by hand.

**Open the app: [unfollowism.pages.dev](https://unfollowism.pages.dev)**

Everything runs in your browser. Your files are never uploaded anywhere.

Unfollowism is an independent project, not affiliated with Instagram or Meta.

## How it works

You work in rounds. Each round:

1. **Get your export.** In Instagram, open **Accounts Center → Your information and permissions →
   Export your information** (called *Download your information* in some versions) → **Create export**,
   choose your profile, and select only **Followers and following**, date range **All time**
   (a shorter range leaves people out, and they would look unfollowed) and format **JSON**.
   It's usually ready within minutes to a few hours; then download the `.zip`.
2. **Import.** Open the app, then add the `.zip` (or `following.json` and every `followers_*.json`
   from it). Next time, in the same browser, the new `.zip` alone is enough: it goes into the work kept
   there. On another device, or if the browser cleared its storage, add your progress file too. Files can
   come from different folders: add them one after another. They are recognized by their content, so
   renaming them is fine.
3. **Decide.** The app has three pages:
   - **Review**: everyone, by list (Following, Followers, Mutual, …), with search and a Filter for tag and
     decision. On each account, **Keep** it as it is, or **Queue unfollow** / **Queue removal**. The `→` opens it
     to add tags and a note.
   - **Changes**: what changed since your previous import: new followers, who no longer follows you, who you
     started and stopped following.
   - **To do**: your queued unfollows and removals. Do them in Instagram (**Open in Instagram**), then
     **Mark done**.
4. **Back up.** Click **Back up** to download `unfollowism_progress_<date>_<time>.json`. Keep that file
   somewhere safe: your work lives in this browser, and the file brings it back if the browser clears
   its storage (Safari may, after about 7 days without opening the app) or you switch devices.

The next import checks your To do list against the new export: accounts that are really gone
are cleared from it, and ones marked done that are still there go back to To do.

**Not backed up:** the header shows **● Not backed up · N accounts**. Click it to see what isn't in your
progress file yet, or to undo it with **Reset changes** (new Instagram data stays). Your work is kept in this
browser, even after you close it, but only your progress file keeps it for good, so back up often. The app works
in one tab at a time: another tab shows **Open in another tab**, and **Use here** moves your work there.

Made for phones first; on a computer it's the same app in a centered column.

## Development

Requires Node.js 22.13 or newer. `.nvmrc` pins the version used by CI and deploys (`nvm use` picks it up).

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
| `npm run format:check` | Check Prettier formatting (`npm run format` fixes it) |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run size` | Check the built files against the size limits (after `npm run build`) |

### CI and deploys

- Every pull request runs typecheck, lint + format check, tests and build in parallel
  ([`ci.yml`](.github/workflows/ci.yml)). `main` only accepts changes once `all-checks-passed` is green.
- The build job also checks the size limits (`"size-limit"` in `package.json`): the files loaded at start, and the
  zip reader the Import screen loads on its own. Raise a limit on purpose, never just to make CI pass.
- Cloudflare Pages deploys every push to `main` to [unfollowism.pages.dev](https://unfollowism.pages.dev),
  and every other branch to a preview URL, which it posts as a comment on the pull request.

### Project layout

```
src/
  app/        startup, the screens, store setup, URL sync, one-active-tab lock
  pages/      Review, To do, Changes, Import, Open in another tab
  widgets/    header, nav, status line, Review top, account list
  features/   filters, save/reset, manage tags, account popup, rename suggestion
  entities/   master: pure logic (lib), browser storage (api), Redux state (model), shared wording (ui)
  shared/     UI kit and theme, small helpers, address bar
```

Layers import only from layers below them ([Feature-Sliced Design](https://feature-sliced.design/)); `npm run lint`
checks it.
