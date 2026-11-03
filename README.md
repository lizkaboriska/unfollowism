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
   from it) **and the master file you saved last time**. Files can come from different folders:
   add them one after another. They are recognized by their content, so renaming them is fine.
3. **Review.** The tabs show:
   - **Review**: everyone, by scope (I follow, People who follow me, Mutual, …), your decision and tag.
   - **New follows**: people you followed since your last save.
   - **To do**: accounts you marked **To unfollow** or **To remove**. Do it on Instagram
     (the name opens their profile), then tick **Done**.
   - **I unfollowed / New followers / Lost followers**: what changed since your last save.

   Tag accounts, add notes, and decide: tick **Kept** to keep an account as it is, or queue it **To unfollow** /
   **To remove**.
4. **Save.** Click **Save master** to download `unfollowism_master_<date>.json`. That file
   is your record: keep it and add it to your next import. Saving also ends the round:
   "new" and "since your last save" count from it next time.

The next import checks your to-do list against the new export: accounts that are really gone
are cleared from it, and ones marked Done that are still there go back to To unfollow / To remove.

**Unsaved work:** the header shows **Unsaved changes (N)**; click it to see what isn't in your
downloaded master yet, or to undo it with **Reset changes**. A reload keeps your unsaved work,
but closing the tab does not, so save before you close.

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

### CI and deploys

- Every pull request runs typecheck, lint + format check, tests and build in parallel
  ([`ci.yml`](.github/workflows/ci.yml)). `main` only accepts changes once `all-checks-passed` is green.
- Cloudflare Pages deploys every push to `main` to [unfollowism.pages.dev](https://unfollowism.pages.dev),
  and every other branch to a preview URL, which it posts as a comment on the pull request.

### Project layout

```
src/
  app/        startup, the screens, store setup, URL sync, tab safety net
  pages/      Review, To do, Changes, Import
  widgets/    header, nav, status line, Review top, account list
  features/   filters, save/reset, manage tags, account popup, rename suggestion
  entities/   master: pure logic (lib), browser storage (api), Redux state (model), shared wording (ui)
  shared/     UI kit and theme, small helpers, address bar
```

Layers import only from layers below them ([Feature-Sliced Design](https://feature-sliced.design/)); `npm run lint`
checks it.
