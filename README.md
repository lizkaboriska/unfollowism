# Instagram Review

Review who you follow and who follows you, using your own Instagram data export.
Tag accounts, mark them reviewed, and keep track of who you unfollowed.

Everything runs in your browser. Your files are never uploaded anywhere.

## Using it

1. In Instagram, open **Settings → Accounts Center → Your information and permissions →
   Download your information** and request your **followers and following** in **JSON** format.
2. Open the app and click **Import files**. Choose the downloaded `.zip` (or `following.json`
   and every `followers_*.json` from it). If you saved a master file before, select it
   together with the export.
3. Review accounts. Unsaved work is kept in the browser if you close the tab.
4. Click **Save master** to download `instagram_master_tracker_<date>.json`.
   Keep it, and choose it together with your next export.

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
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |

### Project layout

```
src/
  core/        pure logic: parsing exports, merging, actions, session diff (no React)
  io/          reading zip/files, detecting file types, download, browser storage
  store/       Redux Toolkit store, thunks, selectors
  App.tsx      UI
legacy/        the previous version of the app, kept for comparison tests
```
