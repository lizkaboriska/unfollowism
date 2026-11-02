import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { Provider } from 'react-redux';

import { App } from '@/app/App.tsx';
import type { StoreDeps } from '@/app/store/deps.ts';
import { makeStore } from '@/app/store/store.ts';
import { memoryLastSaved } from '@/entities/master/api/lastSaved.ts';
import { createMemoryTabDatabase, openIndexedDbTabDatabase, type TabStore } from '@/entities/master/api/tabStore.ts';
import { followersFile, followingFile, must } from '@/entities/master/lib/__tests__/helpers.ts';
import { SAVED_TOAST } from '@/features/save-reset/SaveButton.tsx';
import { formatSince } from '@/shared/lib/dates.ts';
import { DialogProvider } from '@/shared/ui/DialogProvider.tsx';
import { system } from '@/shared/ui/theme.ts';
import { toaster } from '@/shared/ui/toasts.ts';
import { browserAddressBar } from '@/shared/url/addressBar.ts';

// Toasts live outside React; clear them so one test's toast never shows in the next.
afterEach(() => {
  toaster.remove();
  window.history.replaceState(null, '', '/'); // each test starts on Review
});

async function renderApp({
  tab = openIndexedDbTabDatabase(new IDBFactory(), IDBKeyRange).forTab('tab-1'),
  lastSaved = memoryLastSaved(),
  waitForRestore = true,
  now = () => new Date('2026-10-27T12:00:00.000Z'),
  /** Called before each download; throw to make the save fail. */
  beforeDownload = () => undefined,
} = {}) {
  const downloads: { filename: string; text: string }[] = [];
  const deps: StoreDeps = {
    now,
    download: (filename, text) => {
      beforeDownload();
      downloads.push({ filename, text });
    },
    tab,
    lastSaved,
    address: browserAddressBar(),
  };
  const store = makeStore(deps);
  const view = render(
    <ChakraProvider value={system}>
      <Provider store={store}>
        <DialogProvider>
          <App deps={deps} />
        </DialogProvider>
      </Provider>
    </ChakraProvider>,
  );
  // The app first checks browser storage for this tab's work ("Loading your work…").
  if (waitForRestore) {
    await waitFor(() => {
      expect(screen.queryByText('Loading your work…')).not.toBeInTheDocument();
    });
  }
  return { downloads, user: userEvent.setup(), unmount: view.unmount, tab };
}

const followingJson = () =>
  new File([JSON.stringify(followingFile(['alice'], ['bob']))], 'following.json', { type: 'application/json' });
const followersJson = () =>
  new File([JSON.stringify(followersFile(['alice'], ['carol']))], 'followers_1.json', { type: 'application/json' });
const exportFiles = () => [followingJson(), followersJson()];

const importButton = () => screen.getByRole('button', { name: 'Import' });
const findReadyBox = () => screen.findByRole('region', { name: 'Your export is ready' });
/** The rows of the "Your export is ready" box, e.g. "✓Following found2 accounts". */
const readyRows = async () =>
  within(await findReadyBox())
    .getAllByRole('listitem')
    .map(li => li.textContent);
const MISSING_FOLLOWERS = '⚠ Following found. Followers are missing.';

/** Chooses the files and clicks Import, as a user would. */
async function importFiles(user: UserEvent, files: File[]) {
  await user.upload(screen.getByTestId('file-input'), files);
  await waitFor(() => {
    expect(importButton()).toBeEnabled();
  });
  await user.click(importButton());
}

/** A regex for an option's label, ignoring a count after it ("Mutual 3", "artist 2"). */
const optionName = (label: string) => new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\d*$`);

/**
 * Waits until a popup, drawer or dialog has finished opening. One frame after it appears, it hides the page behind
 * it from assistive tech and starts accepting clicks. Before that frame a dialog opened over it would be hidden too,
 * and a click on it would be ignored, so tests (faster than any hand) wait for it, as a user always does.
 */
async function finishedOpening(dialog: Promise<HTMLElement>): Promise<HTMLElement> {
  const opened = await dialog;
  await waitFor(() => {
    expect(screen.queryByRole('heading', { name: 'Unfollowism' })).not.toBeInTheDocument();
    expect(opened).toHaveStyle({ pointerEvents: 'auto' });
  });
  return opened;
}

/** Review: opens the Filter popup. */
async function openFilterPopup(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: /^Filter( \d)?$/ }));
  return finishedOpening(screen.findByRole('dialog', { name: 'Filter' }));
}

async function filterClosed() {
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Filter' })).not.toBeInTheDocument();
  });
}

async function openManageTags(user: UserEvent) {
  await fromMenu(user, 'Manage tags');
  return finishedOpening(screen.findByRole('dialog', { name: 'Manage tags' }));
}

async function closeManageTags(user: UserEvent) {
  const popup = screen.getByRole('dialog', { name: 'Manage tags' });
  await user.click(within(popup).getByRole('button', { name: 'Close' }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Manage tags' })).not.toBeInTheDocument();
  });
}

/** Manage tags: the row of one tag. */
const lineOf = (popup: HTMLElement, tag: string) => must(within(popup).getByText(`#${tag}`).closest('li'));

/** Manage tags: picks Rename or Delete in a tag's ⋯ menu (by keyboard, see fromMenu) and returns its dialog. */
async function openTagDialog(user: UserEvent, tag: string, item: 'Rename' | 'Delete') {
  await user.click(screen.getByRole('button', { name: `Rename or delete ${tag}` }));
  await waitFor(() => {
    expect(screen.getByRole('menu')).toHaveFocus();
  });
  const option = screen.getByRole('menuitem', { name: item });
  for (let presses = 0; !option.hasAttribute('data-highlighted') && presses < 3; presses++) {
    await user.keyboard('{ArrowDown}');
  }
  await user.keyboard('{Enter}');
  return item === 'Rename'
    ? finishedOpening(screen.findByRole('dialog', { name: `Rename #${tag}` }))
    : finishedOpening(screen.findByRole('alertdialog', { name: `Delete #${tag}?` }));
}

async function dialogClosed(name: string) {
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name })).not.toBeInTheDocument();
  });
}

/** Review: picks options in the Filter popup (list, tag, decision) and applies them with "Show N accounts". */
async function applyFilters(user: UserEvent, ...options: string[]) {
  const popup = await openFilterPopup(user);
  for (const option of options) {
    await user.click(within(popup).getByRole('button', { name: optionName(option) }));
  }
  await user.click(within(popup).getByRole('button', { name: /^Show \d+ accounts?$/ }));
  await filterClosed();
}

/** Review: opens an account's popup from its card. */
async function openAccount(user: UserEvent, username: string) {
  await user.click(within(row(username)).getByRole('button', { name: `Open @${username}` }));
  return finishedOpening(screen.findByRole('dialog', { name: `@${username}` }));
}

async function closeAccount(user: UserEvent, username: string) {
  await user.click(within(screen.getByRole('dialog', { name: `@${username}` })).getByRole('button', { name: 'Close' }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: `@${username}` })).not.toBeInTheDocument();
  });
}

/** Review: creates a tag with "+ New tag" in the account's popup (new masters start without tags). */
async function newTag(user: UserEvent, username: string, tag: string) {
  const popup = await openAccount(user, username);
  await user.click(within(popup).getByRole('button', { name: '+ New tag' }));
  await user.type(within(popup).getByRole('textbox', { name: `New tag for @${username}` }), `${tag}{Enter}`);
  await closeAccount(user, username);
}

const row = (username: string) => screen.getByRole('article', { name: `@${username}` });
const findRow = (username: string) => screen.findByRole('article', { name: `@${username}` });
const queryRow = (username: string) => screen.queryByRole('article', { name: `@${username}` });
/** A number in the Review stats box, by its label. */
const stat = (label: string) =>
  within(screen.getByRole('region', { name: 'Your numbers' })).getByText(label).previousElementSibling?.textContent;
const listChip = () => screen.getByRole('button', { name: /^Showing .*\. Change list$/ });
/** Review card: "Keep", or "✓ Kept" once kept. */
const keepButton = (username: string) => within(row(username)).getByRole('button', { name: /^(Keep|✓ Kept)$/ });
const isKept = (username: string) => keepButton(username).getAttribute('aria-pressed') === 'true';
/** Review card: a button by its text, e.g. "Queue unfollow" or "✓ Unfollow queued". */
const cardButton = (username: string, name: string) => within(row(username)).getByRole('button', { name });
const saveButton = () => screen.getByRole('button', { name: 'Save' });
/** Changes: a section by its heading, and the usernames of its rows. */
const section = (title: string) => screen.getByRole('region', { name: title });
const rowsOf = (title: string) =>
  within(section(title))
    .getAllByRole('listitem')
    .map(item => item.getAttribute('aria-label'));

/** An export with these usernames in following and followers (default dates). */
const exportOf = (following: string[], followers: string[]) => {
  const entries = (names: string[]) => names.map((name): [string] => [name]);
  return [
    new File([JSON.stringify(followingFile(...entries(following)))], 'following.json', { type: 'application/json' }),
    new File([JSON.stringify(followersFile(...entries(followers)))], 'followers_1.json', { type: 'application/json' }),
  ];
};
/** Review · Changes · To do; a count follows the label ("To do 2") and is hidden at 0. */
const navItem = (name: RegExp) =>
  within(screen.getByRole('navigation', { name: 'Main' })).getByRole('button', { name });

/** Opens the header's ⋯ menu and returns one of its items, once the menu has taken focus (a frame after opening). */
async function menuItem(user: UserEvent, name: string) {
  await user.click(screen.getByRole('button', { name: 'More' }));
  await waitFor(() => {
    expect(screen.getByRole('menu')).toHaveFocus();
  });
  return screen.getByRole('menuitem', { name });
}

/**
 * Picks a ⋯ menu item with the keyboard. A click can't: the menu highlights items on pointer moves only once the
 * pointer was last used, and jsdom puts every pointer event at (0, 0), so after typing no move ever counts.
 */
async function fromMenu(user: UserEvent, name: string) {
  const item = await menuItem(user, name);
  for (let presses = 0; !item.hasAttribute('data-highlighted') && presses < 5; presses++) {
    await user.keyboard('{ArrowDown}');
  }
  await user.keyboard('{Enter}');
}

test('starts on the import screen', async () => {
  await renderApp();
  expect(screen.getByRole('heading', { name: 'Unfollowism' })).toBeInTheDocument();
  expect(screen.getByText('A fresh start for your feed')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Choose files' })).toBeEnabled();
  expect(importButton()).toBeDisabled();
  // nothing to save or change yet: no Save, no ⋯ menu, no navigation
  expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  expect(screen.queryByRole('navigation', { name: 'Main' })).not.toBeInTheDocument();
});

test('the ? button in the top bar explains how to get the export', async () => {
  const { user } = await renderApp();
  await user.click(
    within(screen.getByRole('banner')).getByRole('button', { name: 'How to get your Instagram export' }),
  );
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('JSON')).toBeInTheDocument();
  expect(within(dialog).getByText('All time')).toBeInTheDocument();
});

test('the steps and "You\'re always in control" show until a file is picked', async () => {
  const { user } = await renderApp();
  expect(screen.getByText('Choose the .zip here')).toBeInTheDocument();
  expect(screen.getByText("You're always in control")).toBeInTheDocument();
  await user.upload(screen.getByTestId('file-input'), [followingJson()]);
  expect(await screen.findByText(MISSING_FOLLOWERS)).toBeInTheDocument();
  expect(screen.queryByText('Choose the .zip here')).not.toBeInTheDocument();
  expect(screen.queryByText("You're always in control")).not.toBeInTheDocument();
  expect(screen.getByText('No login. No Instagram connection. Just your files.')).toBeInTheDocument();
});

test('dragging a file over the file box shows "Drop to add" until it leaves', async () => {
  await renderApp();
  const box = screen.getByRole('region', { name: 'A fresh start for your feed' });
  fireEvent.dragOver(box);
  expect(within(box).getByRole('heading', { name: 'Drop to add' })).toBeInTheDocument();
  fireEvent.dragLeave(box);
  expect(within(box).getByRole('heading', { name: 'A fresh start for your feed' })).toBeInTheDocument();
});

test('import → review → save works end to end', async () => {
  const { downloads, user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), exportFiles());
  expect(await readyRows()).toEqual([
    '✓Following found2 accounts',
    '✓Followers found2 accounts',
    '–Master fileNot selected',
  ]);
  expect(screen.getByText('2 files')).toBeInTheDocument(); // loose files, not one .zip
  expect(screen.queryByRole('region', { name: 'A fresh start for your feed' })).not.toBeInTheDocument();
  await user.click(importButton());

  expect(await screen.findByText(/Started a new master/)).toBeInTheDocument();
  expect(screen.queryByText('Your export is ready')).not.toBeInTheDocument();
  expect(stat('Following')).toBe('2');
  expect(stat('Mutual')).toBe('1');
  expect(row('alice')).toBeInTheDocument();
  expect(queryRow('carol')).not.toBeInTheDocument(); // the Review tab starts on "Following"
  expect(listChip()).toHaveTextContent('Following ▾');

  await user.click(keepButton('bob'));
  expect(screen.getByRole('button', { name: '● Unsaved · 1 changed account' })).toBeInTheDocument();
  await user.click(saveButton());
  await waitFor(() => {
    expect(downloads).toHaveLength(1);
  });
  const saved = JSON.parse(downloads[0]?.text ?? '{}') as {
    accounts: Record<string, { decision?: { kind: string } }>;
  };
  expect(saved.accounts.bob?.decision).toEqual({ kind: 'kept' });
  // Nothing to list once saved: plain text, not a link.
  expect(screen.getByText('All decisions saved')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'All decisions saved' })).not.toBeInTheDocument();
  expect(saveButton()).toBeDisabled();
  expect(await screen.findByText(SAVED_TOAST)).toBeInTheDocument();
  expect(screen.queryByText(/Started a new master/)).not.toBeInTheDocument(); // the import message gives way
});

test('a failed save shows a warning that stays until a save works', async () => {
  let failing = true;
  const { downloads, user } = await renderApp({
    beforeDownload: () => {
      if (failing) {
        throw new Error('disk full');
      }
    },
  });
  await importFiles(user, exportFiles());
  await findRow('bob');
  await user.click(keepButton('bob'));
  await user.click(saveButton());

  const warning = await screen.findByRole('alert');
  expect(within(warning).getByText("⚠ Couldn't save the master file")).toBeInTheDocument();
  expect(within(warning).getByText('Try Save again. Error: disk full')).toBeInTheDocument();
  expect(screen.queryByText(SAVED_TOAST)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '● Unsaved · 1 changed account' })).toBeInTheDocument();

  failing = false;
  await user.click(saveButton());
  expect(await screen.findByText(SAVED_TOAST)).toBeInTheDocument();
  expect(downloads).toHaveLength(1);
  expect(screen.queryByText("⚠ Couldn't save the master file")).not.toBeInTheDocument();
});

test('a missing Followers file is shown and Import stays disabled', async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), [followingJson()]);
  expect(await screen.findByText(MISSING_FOLLOWERS)).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: "Let's find one more file" })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent(/Add followers_1\.json .* from the same export/);
  expect(screen.queryByText('Your export is ready')).not.toBeInTheDocument();
  expect(importButton()).toBeDisabled();
});

const masterJson = (savedAt: string, name = 'unfollowism_master.json') =>
  new File([JSON.stringify({ version: 1, lastSavedAt: savedAt, lastImportAt: savedAt, accounts: {} })], name, {
    type: 'application/json',
  });

test('a missing Following file is shown the same way', async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), [followersJson()]);
  expect(await screen.findByText('⚠ Followers found. Following is missing.')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: "Let's find one more file" })).toBeInTheDocument();
  expect(importButton()).toBeDisabled();
});

test('files with nothing from Instagram in them are reported', async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), [
    new File(['[]'], 'liked_posts.json', { type: 'application/json' }),
  ]);
  expect(await screen.findByText('⚠ No Instagram files found')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'A fresh start for your feed' })).toBeInTheDocument();
  expect(importButton()).toBeDisabled();
});

test('an import that fails says why, and nothing is imported', async () => {
  const { user } = await renderApp();
  const emptyFollowing = new File([JSON.stringify(followingFile())], 'following.json', { type: 'application/json' });
  await importFiles(user, [emptyFollowing, followersJson()]);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent('⚠ Import failed');
  expect(alert).toHaveTextContent('No accounts found in the Following file of this export.');
  expect(screen.getByText('Your export is ready')).toBeInTheDocument();
});

/**
 * Whether the browser would do its default for a file dragged over / dropped on `target` (fireEvent: false =
 * prevented).
 */
const browserHandlesDrop = (target: Element) =>
  ['dragover', 'drop'].some(type => fireEvent(target, new Event(type, { bubbles: true, cancelable: true })));

test('a dropped file is never opened by the browser; dropping on the zone adds it', async () => {
  const { user } = await renderApp();
  expect(browserHandlesDrop(importButton())).toBe(false); // next to the zone

  fireEvent.drop(screen.getByText('A fresh start for your feed'), { dataTransfer: { files: [followingJson()] } });
  expect(await screen.findByText(MISSING_FOLLOWERS)).toBeInTheDocument();
  fireEvent.drop(screen.getByText("Let's find one more file"), { dataTransfer: { files: [followersJson()] } });
  const box = await findReadyBox();
  fireEvent.dragOver(box); // the ready box takes more files too
  expect(within(box).getByRole('heading', { name: 'Drop to add' })).toBeInTheDocument();
  fireEvent.drop(box, { dataTransfer: { files: [masterJson('2026-10-01T00:00:00.000Z')] } });
  await waitFor(async () => {
    expect((await readyRows())[2]).toMatch(/^✓Master fileSelected · /);
  });

  await user.click(importButton());
  await findRow('alice');
  expect(browserHandlesDrop(row('alice'))).toBe(false); // the main view has no drop zone at all
});

test('files chosen one after another add up, e.g. a master from another folder', async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), exportFiles());
  expect((await readyRows())[2]).toBe('–Master fileNot selected');

  await user.upload(screen.getByTestId('file-input'), [masterJson('2026-10-01T00:00:00.000Z')]);
  await waitFor(async () => {
    expect((await readyRows())[2]).toMatch(/^✓Master fileSelected · .*2026$/);
  });
  expect(screen.getByText('2 files')).toBeInTheDocument(); // the master isn't counted as part of the export
  expect(screen.getByText('following.json')).toBeInTheDocument();
  expect(screen.getByText('followers_1.json')).toBeInTheDocument();
  expect(importButton()).toBeEnabled();
});

test('Add more files opens the file picker again', async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), exportFiles());
  await findReadyBox();
  const input = screen.getByTestId('file-input');
  const opened = vi.spyOn(input, 'click');
  await user.click(screen.getByRole('button', { name: 'Add more files' }));
  expect(opened).toHaveBeenCalledOnce();
});

test('choosing the same file twice keeps one entry; × removes a file', async () => {
  const { user } = await renderApp();
  const files = exportFiles();
  await user.upload(screen.getByTestId('file-input'), files);
  await user.upload(screen.getByTestId('file-input'), [must(files[0])]);
  await waitFor(() => {
    expect(importButton()).toBeEnabled();
  });
  expect(screen.getAllByText('following.json')).toHaveLength(1);

  await user.click(screen.getByRole('button', { name: 'Remove followers_1.json' }));
  expect(await screen.findByText(MISSING_FOLLOWERS)).toBeInTheDocument();
  expect(importButton()).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Clear all' }));
  expect(screen.queryByText('following.json')).not.toBeInTheDocument();
  expect(screen.queryByText(MISSING_FOLLOWERS)).not.toBeInTheDocument();
  expect(screen.getByText('Choose the .zip here')).toBeInTheDocument(); // back to the start
});

test('a conflict keeps the list so the extra file can be removed', async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), [
    ...exportFiles(),
    masterJson('2026-10-01T00:00:00.000Z', 'old.json'),
  ]);
  await user.upload(screen.getByTestId('file-input'), [masterJson('2026-10-20T00:00:00.000Z', 'new.json')]);
  expect(await screen.findByText(/Found 2 master files/)).toBeInTheDocument();
  expect(importButton()).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Remove old.json' }));
  expect((await readyRows())[2]).toMatch(/^✓Master fileSelected · /);
  expect(screen.getByText('new.json')).toBeInTheDocument();
  expect(screen.queryByText(/Found 2 master files/)).not.toBeInTheDocument();
  expect(importButton()).toBeEnabled();
});

test("a selection that can't be imported shows a readable error", async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), [
    new File(['<html>'], 'following.html', { type: 'text/html' }),
    new File(['<html>'], 'followers_1.html', { type: 'text/html' }),
  ]);
  const alert = await screen.findByRole('alert');
  expect(alert).toHaveTextContent("⚠ These files can't be used");
  expect(alert).toHaveTextContent(/This export is in HTML format/);
  expect(importButton()).toBeDisabled();
});

const savedBefore = () => {
  const lastSaved = memoryLastSaved();
  lastSaved.set('2026-10-20T12:00:00.000Z'); // noon UTC: the same date in nearly every time zone
  return lastSaved;
};

test('without a master after a previous save, a warning asks for it; Start fresh hides it; no popup', async () => {
  const { user } = await renderApp({ lastSaved: savedBefore() });
  await user.upload(screen.getByTestId('file-input'), exportFiles());
  expect((await readyRows())[2]).toBe('–Master fileNot selected');
  const warning = within(await findReadyBox()).getByRole('alert');
  expect(warning).toHaveTextContent('⚠ Have your saved master?');
  expect(warning).toHaveTextContent('You downloaded a master on Oct 20, 2026, but none is selected.');
  expect(screen.getByText(/A master restores your saved work, not Instagram data/)).toBeInTheDocument();

  const opened = vi.spyOn(screen.getByTestId('file-input'), 'click');
  await user.click(within(warning).getByRole('button', { name: 'Add saved master' }));
  expect(opened).toHaveBeenCalledOnce();

  await user.click(within(warning).getByRole('button', { name: 'Start fresh' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect(screen.queryByText(/A master restores your saved work/)).not.toBeInTheDocument();

  await user.click(importButton());
  expect(await findRow('bob')).toBeInTheDocument(); // no "Import without your master?" popup
});

test('Import works while the saved-master warning shows; a changed selection shows it again', async () => {
  const { user } = await renderApp({ lastSaved: savedBefore() });
  await user.upload(screen.getByTestId('file-input'), exportFiles());
  await user.click(within(await findReadyBox()).getByRole('button', { name: 'Start fresh' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Remove followers_1.json' }));
  await user.upload(screen.getByTestId('file-input'), [followersJson()]);
  expect(await screen.findByText('⚠ Have your saved master?')).toBeInTheDocument();

  await user.click(importButton());
  expect(await findRow('bob')).toBeInTheDocument();
});

test('an older master is warned about with both dates; Use older file hides it', async () => {
  const { user } = await renderApp({ lastSaved: savedBefore() });
  await user.upload(screen.getByTestId('file-input'), [...exportFiles(), masterJson('2026-10-01T12:00:00.000Z')]);
  expect((await readyRows())[2]).toBe('⚠Master fileSelected · Oct 1, 2026');
  const warning = within(await findReadyBox()).getByRole('alert');
  expect(warning).toHaveTextContent('⚠ This master is older');
  expect(warning).toHaveTextContent('Selected masterOct 1, 2026Last saved masterOct 20, 2026');
  expect(warning).toHaveTextContent("Decisions saved after Oct 1, 2026 won't come back. Choose your Oct 20, 2026");
  expect(screen.getByText(/This warning is only about the master file/)).toBeInTheDocument();
  expect(importButton()).toBeEnabled();

  await user.click(within(warning).getByRole('button', { name: 'Use older file' }));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  expect((await readyRows())[2]).toBe('✓Master fileSelected · Oct 1, 2026');
});

test('Choose newer master swaps the older master for the picked one', async () => {
  const { user } = await renderApp({ lastSaved: savedBefore() });
  await user.upload(screen.getByTestId('file-input'), [
    ...exportFiles(),
    masterJson('2026-10-01T12:00:00.000Z', 'old.json'),
  ]);
  const input = screen.getByTestId('file-input');
  vi.spyOn(input, 'click').mockImplementation(() => undefined); // the picker itself is the browser's
  await user.click(within(await findReadyBox()).getByRole('button', { name: 'Choose newer master' }));
  await user.upload(input, [masterJson('2026-10-20T12:00:00.000Z', 'new.json')]);

  await waitFor(async () => {
    expect((await readyRows())[2]).toBe('✓Master fileSelected · Oct 20, 2026');
  });
  expect(screen.queryByText('old.json')).not.toBeInTheDocument();
  expect(screen.getByText('new.json')).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // no "two master files", no warning
});

test('masters saved on the same day show the time too', async () => {
  const { user } = await renderApp({ lastSaved: savedBefore() });
  await user.upload(screen.getByTestId('file-input'), [...exportFiles(), masterJson('2026-10-20T09:00:00.000Z')]);
  const warning = within(await findReadyBox()).getByRole('alert');
  expect(warning).toHaveTextContent(/Selected masterOct 20, 2026, \d+:\d+.*Last saved masterOct 20, 2026, \d+:\d+/);
});

test('Import new files can be cancelled', async () => {
  const { user } = await renderApp();
  await importFiles(user, exportFiles());
  await findRow('bob');
  expect(screen.getByRole('button', { name: '● New import not saved' })).toBeInTheDocument();
  await fromMenu(user, 'Import new files');
  expect(screen.getByText('A fresh start for your feed')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(row('bob')).toBeInTheDocument();
  await user.click(keepButton('bob'));
  await fromMenu(user, 'Reset changes'); // the menu still works once the header is back
  expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
});

test('Manage tags opens from the ⋯ menu', async () => {
  const { user } = await renderApp();
  await importFiles(user, exportFiles());
  await findRow('bob');
  await fromMenu(user, 'Manage tags');
  expect(await screen.findByRole('dialog', { name: 'Manage tags' })).toBeInTheDocument();
});

test('importing over unsaved work asks first', async () => {
  const { user } = await renderApp();
  await importFiles(user, exportFiles());
  await findRow('bob');
  await user.click(keepButton('bob'));

  await fromMenu(user, 'Import new files');
  await importFiles(user, exportFiles());
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText('Discard unsaved changes?')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(screen.getByText('Your export is ready')).toBeInTheDocument(); // nothing imported

  await user.click(importButton());
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Import anyway' }));
  await waitFor(() => {
    expect(isKept('bob')).toBe(false);
  });
});

test("a browser that can't keep the work warns on Review, once something is imported", async () => {
  const { user } = await renderApp({ tab: createMemoryTabDatabase().forTab('memory') });
  expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // nothing to lose yet
  await importFiles(user, exportFiles());
  await findRow('bob');
  expect(screen.getByRole('alert')).toHaveTextContent(
    "⚠ This browser can't keep your workIts storage is unavailable or full, so a reload would lose your edits. " +
      "Tap Save at the top so your decisions don't get lost.",
  );
});

test('a reload silently continues where the tab left off', async () => {
  const first = await renderApp();
  await importFiles(first.user, exportFiles());
  await findRow('bob');
  await first.user.click(keepButton('bob'));
  await waitFor(async () => {
    expect(Object.keys((await first.tab.load())?.changed ?? {})).toContain('bob');
  }); // the tick is stored
  first.unmount();

  await renderApp({ tab: first.tab }); // same tab storage, fresh page
  expect(await findRow('bob')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '● Unsaved · 1 changed account' })).toBeInTheDocument();
  expect(isKept('bob')).toBe(true);
});

test('a reload shows Loading your work… instead of flashing the import screen', async () => {
  const first = await renderApp();
  await importFiles(first.user, exportFiles());
  await findRow('bob');
  await waitFor(async () => {
    expect(await first.tab.load()).not.toBeNull();
  }); // the import is stored
  first.unmount();

  let release!: () => void;
  const gate = new Promise<void>(resolve => {
    release = resolve;
  });
  const slowTab: TabStore = {
    ...first.tab,
    load: async () => {
      await gate;
      return first.tab.load();
    },
  };
  await renderApp({ tab: slowTab, waitForRestore: false });
  const loading = screen.getByRole('status');
  expect(loading).toHaveTextContent('Loading your work…');
  expect(within(loading).getByRole('heading', { name: 'Unfollowism' })).toBeInTheDocument();
  expect(screen.queryByText('A fresh start for your feed')).not.toBeInTheDocument();
  release();
  expect(await findRow('bob')).toBeInTheDocument();
});

test("work that can't be restored after a reload is reported on the import screen", async () => {
  const tab = openIndexedDbTabDatabase(new IDBFactory(), IDBKeyRange).forTab('tab-1');
  const { user } = await renderApp({ tab: { ...tab, load: () => Promise.reject(new Error('unreadable')) } });
  expect(screen.getByRole('alert')).toHaveTextContent("⚠ Your work couldn't be restored");

  await importFiles(user, exportFiles());
  expect(await findRow('bob')).toBeInTheDocument();
  await fromMenu(user, 'Import new files');
  expect(screen.queryByText(/couldn't be restored/)).not.toBeInTheDocument();
});

test("Import shows that it's working", async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), exportFiles());
  await waitFor(() => {
    expect(importButton()).toBeEnabled();
  });
  await user.click(importButton());
  expect(screen.getByRole('button', { name: /Importing…/ })).toBeDisabled();
  expect(await findRow('bob')).toBeInTheDocument();
});

test('Reset changes in the ⋯ menu asks first, then undoes unsaved work', async () => {
  const { user } = await renderApp();
  await importFiles(user, exportFiles());
  await findRow('bob');
  const resetDisabled = async () => {
    const disabled = (await menuItem(user, 'Reset changes')).hasAttribute('data-disabled');
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    });
    return disabled;
  };
  expect(await resetDisabled()).toBe(true);

  await user.click(keepButton('bob'));
  expect(isKept('bob')).toBe(true);
  expect(await resetDisabled()).toBe(false);

  await fromMenu(user, 'Reset changes');
  const dialog = await screen.findByRole('alertdialog');
  // Started from an export only: nothing was saved yet, so Reset goes back to the import.
  expect(within(dialog).getByText('Your changes to 1 account since the import will be undone.')).toBeInTheDocument();
  expect(within(dialog).getByText('Instagram stays as it is.')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(isKept('bob')).toBe(true);

  await fromMenu(user, 'Reset changes');
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reset changes' }));
  await waitFor(() => {
    expect(isKept('bob')).toBe(false);
  });
  expect(await resetDisabled()).toBe(true);

  // Once saved, the dialog speaks of the last save and the saved master file.
  await user.click(keepButton('bob'));
  await user.click(saveButton());
  await user.click(keepButton('alice'));
  await fromMenu(user, 'Reset changes');
  const afterSave = await screen.findByRole('alertdialog');
  expect(
    within(afterSave).getByText('Your changes to 1 account since your last save will be undone.'),
  ).toBeInTheDocument();
  expect(within(afterSave).getByText('Your saved master file and Instagram stay as they are.')).toBeInTheDocument();
});

describe('main view', () => {
  // exportFiles(): following alice + bob, followers alice + carol. Without a saved master everyone counts as new.
  async function imported() {
    const t = await renderApp();
    await importFiles(t.user, exportFiles());
    await findRow('bob');
    return t;
  }
  const shown = () => screen.queryAllByRole('article').map(card => card.getAttribute('aria-label'));

  test('the navigation switches pages; To do with nothing queued says so', async () => {
    const { user } = await imported();
    expect(shown()).toEqual(['@alice', '@bob']);
    expect(navItem(/^Review$/)).toHaveAttribute('aria-current', 'page');

    // No saved master yet: nothing to compare with, so no count and no sections.
    await user.click(navItem(/^Changes$/));
    expect(navItem(/^Changes$/)).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText(/^Nothing to compare yet/)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Compared files' })).not.toBeInTheDocument();

    await user.click(navItem(/^To do$/)); // nothing queued: no count, but it still opens
    expect(screen.getByRole('heading', { name: 'Nothing queued' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument(); // nothing to track
    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change list$/ })).not.toBeInTheDocument(); // the list is Review-only
    await user.click(screen.getByRole('button', { name: 'Back to Review' }));
    expect(navItem(/^Review$/)).toHaveAttribute('aria-current', 'page');
  });

  test('To do lists everything queued, whatever the search and filters in Review', async () => {
    const { user } = await imported();
    await newTag(user, 'alice', 'artist');
    await user.click(cardButton('alice', 'Queue unfollow'));
    await user.click(cardButton('bob', 'Queue unfollow'));
    await applyFilters(user, 'artist');
    await user.type(screen.getByRole('searchbox', { name: 'Search accounts' }), 'al');
    await waitFor(() => {
      expect(shown()).toEqual(['@alice']);
    });

    await user.click(navItem(/^To do 2$/));
    expect(shown()).toEqual(['@alice', '@bob']);
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument(); // To do has no search or filters

    await user.click(navItem(/^Review$/)); // Review keeps them
    expect(shown()).toEqual(['@alice']);
    expect(screen.getByRole('button', { name: 'Remove filter artist' })).toBeInTheDocument();
  });

  test('Review top: heading, your numbers, and the links switch the list', async () => {
    const { user } = await imported();
    expect(screen.getByRole('heading', { level: 1, name: 'Review' })).toBeInTheDocument();
    expect(screen.getByText(/^Imported .+ · no saved master yet$/)).toBeInTheDocument();
    expect([stat('Following'), stat('Followers'), stat('Mutual')]).toEqual(['2', '2', '1']);

    await user.click(screen.getByRole('button', { name: '1 not following back' }));
    expect(listChip()).toHaveTextContent('Not following back ▾');
    expect(shown()).toEqual(['@bob']);
    await user.click(screen.getByRole('button', { name: '1 follow you only' }));
    expect(listChip()).toHaveTextContent('Follows you only ▾');
    expect(shown()).toEqual(['@carol']);
    expect(screen.getByText('1 account')).toBeInTheDocument();
  });

  test('Filter popup: choices apply only on Show N accounts; × forgets them; the list chip opens it', async () => {
    const { user } = await imported();
    const popup = await openFilterPopup(user);
    const option = (label: string) => within(popup).getByRole('button', { name: optionName(label) });
    expect(option('Following')).toHaveTextContent('Following2');
    expect(option('Following')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Everyone now')).toHaveTextContent('Everyone now3');
    expect(option('Any tag')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Any')).toHaveAttribute('aria-pressed', 'true');
    expect(within(popup).getByRole('button', { name: 'Show 2 accounts' })).toBeInTheDocument();

    await user.click(option('Mutual'));
    await user.click(option('Needs a decision'));
    expect(option('Mutual')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Following')).toHaveAttribute('aria-pressed', 'false');
    expect(within(popup).getByRole('button', { name: 'Show 1 account' })).toBeInTheDocument(); // counts the draft
    // the list behind doesn't change yet (it's hidden from screen readers while the popup is open)
    const behind = screen.queryAllByRole('article', { hidden: true }).map(card => card.getAttribute('aria-label'));
    expect(behind).toEqual(['@alice', '@bob']);

    await user.click(within(popup).getByRole('button', { name: 'Close' }));
    await filterClosed();
    expect(shown()).toEqual(['@alice', '@bob']); // closing forgets the choices
    expect(listChip()).toHaveTextContent('Following ▾');

    await user.click(listChip());
    expect(await screen.findByRole('dialog', { name: 'Filter' })).toBeInTheDocument();
  });

  test('filter chips: the Filter count and Clear all cover tag and decision, never the list', async () => {
    const { user } = await imported();
    await newTag(user, 'alice', 'artist');
    await applyFilters(user, 'Mutual');
    expect(shown()).toEqual(['@alice']);
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument(); // a list isn't a filter

    await applyFilters(user, 'Following', 'Needs a decision');
    expect(screen.getByRole('button', { name: 'Filter 1' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear all' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove filter Needs a decision' }));
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();

    await applyFilters(user, 'Mutual', 'artist', 'Needs a decision');
    expect(screen.getByRole('button', { name: 'Filter 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove filter artist' })).toBeInTheDocument();
    await user.click(keepButton('alice'));
    await user.click(screen.getByRole('button', { name: 'Clear all' }));
    expect(screen.getByRole('button', { name: 'Filter' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Remove filter/ })).not.toBeInTheDocument();
    expect(listChip()).toHaveTextContent('Mutual ▾'); // Clear all keeps the list
    expect(shown()).toEqual(['@alice']);

    // Reset in the popup does the same: filters back to any, the list stays.
    const popup = await openFilterPopup(user);
    await user.click(within(popup).getByRole('button', { name: optionName('artist') }));
    await user.click(within(popup).getByRole('button', { name: 'Kept' }));
    await user.click(within(popup).getByRole('button', { name: 'Reset' }));
    expect(within(popup).getByRole('button', { name: 'Any tag' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(popup).getByRole('button', { name: 'Any' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(popup).getByRole('button', { name: optionName('Mutual') })).toHaveAttribute('aria-pressed', 'true');
  });

  test('a ticked card stays until the list refreshes', async () => {
    const { user } = await imported();
    await applyFilters(user, 'Needs a decision');
    await user.click(keepButton('bob'));
    expect(shown()).toEqual(['@alice', '@bob']); // still there while you work
    await applyFilters(user, 'Any');
    await applyFilters(user, 'Needs a decision');
    expect(shown()).toEqual(['@alice']);
  });

  test('plans: offered only when the follow exists; To do → Mark done, Undo, All done', async () => {
    const { user } = await imported();
    await applyFilters(user, 'Everyone now');
    // The popup offers each plan whose follow exists: alice (mutual) both, bob only unfollow, carol only removal.
    const queueOptions = async (username: string) => {
      const popup = await openAccount(user, username);
      const names = within(popup)
        .queryAllByRole('button', { name: /^Queue / })
        .map(b => b.textContent);
      await closeAccount(user, username);
      return names;
    };
    expect(await queueOptions('alice')).toEqual(['Queue unfollow', 'Queue removal']);
    expect(await queueOptions('bob')).toEqual(['Queue unfollow']); // bob doesn't follow me
    expect(await queueOptions('carol')).toEqual(['Queue removal']); // I don't follow carol
    expect(cardButton('carol', 'Queue removal')).toBeInTheDocument(); // the card offers the one that exists

    await user.click(cardButton('bob', 'Queue unfollow'));
    expect(isKept('bob')).toBe(false); // queuing is the decision: queued, not Kept
    expect(cardButton('bob', '✓ Unfollow queued')).toHaveAttribute('aria-pressed', 'true');
    await applyFilters(user, 'Needs a decision');
    await user.click(navItem(/^To do 1$/));
    expect(shown()).toEqual(['@bob']);
    expect(screen.getByRole('tab', { name: 'Unfollow 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Remove follower' })).toBeInTheDocument(); // count hidden at 0
    expect(screen.getByText('0 of 1 done')).toBeInTheDocument();
    expect(within(row('bob')).getByText('Not following back')).toBeInTheDocument();
    expect(within(row('bob')).getByRole('link', { name: 'Open in Instagram ↗' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/bob',
    );
    expect(within(row('bob')).queryByRole('textbox')).not.toBeInTheDocument(); // notes are edited in Review

    await user.click(within(row('bob')).getByRole('button', { name: '✓ Mark done' }));
    expect(within(row('bob')).getByText('✓ Done')).toBeInTheDocument();
    expect(within(row('bob')).queryByRole('link')).not.toBeInTheDocument();
    expect(screen.getByText('1 of 1 done')).toBeInTheDocument();
    expect(screen.getByText('All unfollows done')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Unfollow' })).toBeInTheDocument(); // nothing left in it
    expect(shown()).toEqual(['@bob']); // the tabs stay while you're on the page

    await user.click(within(row('bob')).getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('0 of 1 done')).toBeInTheDocument();
    await user.click(within(row('bob')).getByRole('button', { name: '✓ Mark done' }));
    await user.click(navItem(/^Review$/));
    expect(navItem(/^To do$/)).toBeInTheDocument(); // the count is hidden at 0
    await applyFilters(user, 'Any');
    // marked done in To do, waiting for the next import: the card says so; tapping it would undo the plan
    expect(cardButton('bob', '✓ Unfollow done')).toHaveAttribute('aria-pressed', 'true');

    // Coming back with nothing left: All done. The done plans can still be viewed and undone until the next import.
    await user.click(navItem(/^To do$/));
    expect(screen.getByRole('heading', { name: 'All done, for now' })).toBeInTheDocument();
    expect(screen.getByText('1 of 1 done')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'View completed · 1' }));
    expect(shown()).toEqual(['@bob']);
    expect(within(row('bob')).getByText('✓ Done')).toBeInTheDocument();
    await user.click(navItem(/^Review$/));
    await user.click(navItem(/^To do$/));
    expect(screen.getByRole('heading', { name: 'All done, for now' })).toBeInTheDocument(); // not remembered
  });

  test('To do opens on Unfollow, or on Remove follower when no unfollows are left; done rows move down', async () => {
    const { user } = await imported();
    await applyFilters(user, 'Everyone now');
    await user.click(cardButton('carol', 'Queue removal'));
    await user.click(navItem(/^To do 1$/));
    expect(screen.getByRole('tab', { name: 'Remove follower 1' })).toHaveAttribute('aria-selected', 'true');
    expect(shown()).toEqual(['@carol']);
    await user.click(screen.getByRole('tab', { name: 'Unfollow' }));
    expect(screen.getByText('No unfollows queued.')).toBeInTheDocument();

    await user.click(navItem(/^Review$/));
    await user.click(cardButton('alice', 'Queue unfollow'));
    await user.click(cardButton('bob', 'Queue unfollow'));
    await user.click(navItem(/^To do 3$/));
    expect(screen.getByRole('tab', { name: 'Unfollow 2' })).toHaveAttribute('aria-selected', 'true');
    expect(shown()).toEqual(['@alice', '@bob']);

    await user.click(within(row('alice')).getByRole('button', { name: '✓ Mark done' }));
    expect(shown()).toEqual(['@alice', '@bob']); // no jump under your finger
    await user.click(screen.getByRole('tab', { name: 'Remove follower 1' }));
    await user.click(screen.getByRole('tab', { name: 'Unfollow 1' }));
    expect(shown()).toEqual(['@bob', '@alice']); // done at the bottom once the list refreshes
  });

  test('the URL follows the page, list and search; a reload on any page shows it again', async () => {
    const url = () => window.location.pathname + window.location.search;
    const { user, tab, unmount } = await imported();
    expect(url()).toBe('/');
    await applyFilters(user, 'Followers');
    await user.click(cardButton('carol', 'Queue removal'));
    await user.type(screen.getByRole('searchbox', { name: 'Search accounts' }), 'al');
    await waitFor(() => {
      expect(url()).toBe('/?list=followers&q=al');
    });
    await user.click(navItem(/^Changes$/));
    expect(url()).toBe('/changes'); // Review's filters stay in the store, not in this URL
    await user.click(navItem(/^Review$/));
    expect(url()).toBe('/?list=followers&q=al');
    await waitFor(async () => {
      expect(Object.keys((await tab.load())?.changed ?? {})).toContain('carol');
    }); // the plan is stored
    unmount();

    const reload = async (at: string) => {
      window.history.replaceState(null, '', at);
      const page = await renderApp({ tab });
      await screen.findByRole('navigation', { name: 'Main' });
      return page;
    };
    let page = await reload('/?list=followers&q=al');
    expect(listChip()).toHaveTextContent('Followers ▾');
    expect(screen.getByRole('searchbox', { name: 'Search accounts' })).toHaveValue('al');
    expect(shown()).toEqual(['@alice']);
    page.unmount();

    page = await reload('/todo'); // To do picks its tab, and the URL says which
    expect(screen.getByRole('tab', { name: 'Remove follower 1' })).toHaveAttribute('aria-selected', 'true');
    expect(url()).toBe('/todo/remove');
    page.unmount();

    await reload('/changes/?list=mutual&q=al'); // filters aren't part of Changes' URL
    expect(navItem(/^Changes$/)).toHaveAttribute('aria-current', 'page');
    expect(url()).toBe('/changes');
  });

  test('Back goes to the last page, with the list Review had there; Forward comes back', async () => {
    const { user } = await imported();
    await applyFilters(user, 'Followers');
    await user.click(navItem(/^Changes$/));
    await user.click(navItem(/^Review$/));
    await applyFilters(user, 'Mutual');
    await user.click(navItem(/^To do$/));

    const backTo = async (page: RegExp) => {
      window.history.back();
      await waitFor(() => {
        expect(navItem(page)).toHaveAttribute('aria-current', 'page');
      });
    };
    await backTo(/^Review$/);
    expect(listChip()).toHaveTextContent('Mutual ▾');
    await backTo(/^Changes$/);
    await backTo(/^Review$/);
    expect(listChip()).toHaveTextContent('Followers ▾');
    window.history.forward();
    await waitFor(() => {
      expect(navItem(/^Changes$/)).toHaveAttribute('aria-current', 'page');
    });
  });

  test('a URL that Review does not understand is fixed silently', async () => {
    window.history.replaceState(null, '', '/somewhere?list=friends&q=al');
    const first = await renderApp();
    await importFiles(first.user, exportFiles());
    await findRow('bob');
    await waitFor(async () => {
      expect(await first.tab.load()).not.toBeNull();
    });
    expect(window.location.pathname + window.location.search).toBe('/'); // no work yet: Welcome cleaned it up
    first.unmount();

    window.history.replaceState(null, '', '/somewhere?list=friends&decision=kept&q=al');
    await renderApp({ tab: first.tab });
    await screen.findByRole('navigation', { name: 'Main' });
    expect(navItem(/^Review$/)).toHaveAttribute('aria-current', 'page');
    expect(window.location.pathname + window.location.search).toBe('/?decision=kept&q=al');
  });

  test('To do → Keep instead removes the plan; Undo brings it back', async () => {
    const { user } = await imported();
    await newTag(user, 'alice', 'artist');
    await user.click(cardButton('alice', 'Queue unfollow'));
    await user.click(cardButton('bob', 'Queue unfollow'));
    await user.click(navItem(/^To do 2$/));
    expect(within(row('alice')).getByText('#artist')).toBeInTheDocument(); // its tags, read-only
    expect(within(row('alice')).queryByRole('button', { name: 'artist' })).not.toBeInTheDocument();
    expect(screen.getByText('0 of 2 done')).toBeInTheDocument();

    await user.click(within(row('alice')).getByRole('button', { name: 'Keep instead' }));
    expect(within(row('alice')).getByText('Kept')).toBeInTheDocument(); // stays, so it can be undone
    expect(navItem(/^To do 1$/)).toBeInTheDocument();
    expect(screen.getByText('0 of 1 done')).toBeInTheDocument();
    await user.click(within(row('alice')).getByRole('button', { name: 'Undo' }));
    expect(navItem(/^To do 2$/)).toBeInTheDocument();

    await user.click(within(row('alice')).getByRole('button', { name: 'Keep instead' }));
    await user.click(navItem(/^Review$/)); // refresh the list
    expect(isKept('alice')).toBe(true);
    await user.click(navItem(/^To do 1$/));
    expect(shown()).toEqual(['@bob']);
  });

  test('a mutual with both plans is in both tabs; each is done on its own', async () => {
    const { user } = await imported();
    const popup = await openAccount(user, 'alice');
    await user.click(within(popup).getByRole('button', { name: 'Queue unfollow' }));
    await user.click(within(popup).getByRole('button', { name: 'Queue removal' }));
    await closeAccount(user, 'alice');

    await user.click(navItem(/^To do 2$/));
    expect(screen.getByRole('tab', { name: 'Unfollow 1' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Remove follower 1' })).toBeInTheDocument();
    expect(screen.getByText('0 of 2 done')).toBeInTheDocument();
    expect(shown()).toEqual(['@alice']);

    await user.click(within(row('alice')).getByRole('button', { name: '✓ Mark done' }));
    expect(screen.getByText('1 of 2 done')).toBeInTheDocument();
    await user.click(screen.getByRole('tab', { name: 'Remove follower 1' }));
    expect(within(row('alice')).getByRole('button', { name: '✓ Mark done' })).toBeInTheDocument(); // still queued
  });

  test('Reset changes while All done shows updates the page', async () => {
    const { user } = await imported();
    await user.click(cardButton('bob', 'Queue unfollow'));
    await user.click(navItem(/^To do 1$/));
    await user.click(within(row('bob')).getByRole('button', { name: '✓ Mark done' }));
    await user.click(navItem(/^Review$/));
    await user.click(navItem(/^To do$/));
    expect(screen.getByRole('heading', { name: 'All done, for now' })).toBeInTheDocument();

    // Nothing was saved, so Reset goes back to the import, where nothing was queued.
    await fromMenu(user, 'Reset changes');
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reset changes' }));
    expect(await screen.findByRole('heading', { name: 'Nothing queued' })).toBeInTheDocument();
  });

  test('tags and notes end up in the saved master', async () => {
    const { user, downloads } = await imported();
    await newTag(user, 'bob', 'dog');
    const popup = await openAccount(user, 'bob');
    await user.type(within(popup).getByRole('textbox', { name: 'Note for @bob' }), 'met at a show');
    await closeAccount(user, 'bob'); // closing mid-pause still stores the note
    await user.click(saveButton());
    await waitFor(() => {
      expect(downloads).toHaveLength(1);
    });
    const saved = JSON.parse(must(downloads[0]).text) as {
      accounts: Record<string, { review: { tags: string[]; notes: string } }>;
    };
    expect(saved.accounts.bob?.review).toMatchObject({ tags: ['dog'], notes: 'met at a show' });
  });

  test('the Instagram link opens a side popup; modifier clicks are left to the browser', async () => {
    const { user } = await imported();
    const open = vi.spyOn(window, 'open').mockReturnValue({ focus: () => undefined } as Window);
    const popup = await openAccount(user, 'bob');
    const link = within(popup).getByRole('link', { name: 'Open in Instagram ↗' });
    expect(link).toHaveAttribute('href', 'https://www.instagram.com/bob');
    await user.click(link);
    expect(open).toHaveBeenCalledWith(
      'https://www.instagram.com/bob',
      'unfollowism-profile',
      expect.stringContaining('popup=yes'),
    );

    open.mockClear();
    await user.keyboard('{Meta>}');
    await user.click(link);
    await user.keyboard('{/Meta}');
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe('Review cards and the account popup', () => {
  // exportFiles(): following alice + bob, followers alice + carol.
  async function imported() {
    const t = await renderApp();
    await importFiles(t.user, exportFiles());
    await findRow('bob');
    return t;
  }
  const pressed = (button: HTMLElement) => button.getAttribute('aria-pressed') === 'true';
  const shown = () => screen.queryAllByRole('article').map(card => card.getAttribute('aria-label'));

  test('Keep and the queue button switch back when tapped again', async () => {
    const { user } = await imported();
    expect(within(row('alice')).getByText('Mutual')).toBeInTheDocument();
    await user.click(keepButton('alice'));
    expect(cardButton('alice', '✓ Kept')).toHaveAttribute('aria-pressed', 'true');
    await user.click(keepButton('alice'));
    expect(isKept('alice')).toBe(false); // needs a decision again

    await user.click(keepButton('alice'));
    await user.click(cardButton('alice', 'Queue unfollow')); // queuing replaces Kept
    expect(isKept('alice')).toBe(false);
    await user.click(cardButton('alice', '✓ Unfollow queued'));
    expect(cardButton('alice', 'Queue unfollow')).toHaveAttribute('aria-pressed', 'false');
    expect(isKept('alice')).toBe(false); // undoing the last plan: needs a decision, not back to Kept
  });

  test('a card shows a plan queued in the popup; "Both queued" opens the popup; Keep there clears both', async () => {
    const { user } = await imported();
    let popup = await openAccount(user, 'alice'); // mutual: both plans possible
    await user.click(within(popup).getByRole('button', { name: 'Queue removal' }));
    expect(within(popup).getByRole('button', { name: '✓ Removal queued' })).toBeInTheDocument();
    await closeAccount(user, 'alice');
    expect(cardButton('alice', '✓ Removal queued')).toHaveAttribute('aria-pressed', 'true'); // not "Queue unfollow"
    await user.click(cardButton('alice', '✓ Removal queued')); // undoes it
    expect(cardButton('alice', 'Queue unfollow')).toBeInTheDocument();

    popup = await openAccount(user, 'alice');
    await user.click(within(popup).getByRole('button', { name: 'Queue unfollow' }));
    await user.click(within(popup).getByRole('button', { name: 'Queue removal' }));
    await closeAccount(user, 'alice');
    await user.click(cardButton('alice', '✓ Both queued'));
    popup = await screen.findByRole('dialog', { name: '@alice' });
    expect(within(popup).getByRole('button', { name: '✓ Unfollow queued' })).toBeInTheDocument();
    expect(within(popup).getByRole('button', { name: '✓ Removal queued' })).toBeInTheDocument();

    await user.click(within(popup).getByRole('button', { name: 'Keep' }));
    expect(pressed(within(popup).getByRole('button', { name: '✓ Kept' }))).toBe(true);
    expect(within(popup).getByRole('button', { name: 'Queue unfollow' })).toBeInTheDocument();
    expect(within(popup).getByRole('button', { name: 'Queue removal' })).toBeInTheDocument();
    expect(within(popup).getByText('Queue one or both. Keep clears them.')).toBeInTheDocument();
  });

  test("+ New tag: Enter (the phone's Done) or leaving the field adds it; Escape cancels, not the popup", async () => {
    const { user } = await imported();
    const popup = await openAccount(user, 'bob');
    const field = () => within(popup).getByRole('textbox', { name: 'New tag for @bob' });
    const newTagButton = () => within(popup).getByRole('button', { name: '+ New tag' });
    const tagged = () =>
      within(within(popup).getByRole('group', { name: 'Tags for @bob' })).queryAllByRole('button', { pressed: true });

    await user.click(newTagButton());
    expect(field()).toHaveAttribute('enterkeyhint', 'done');
    await user.type(field(), 'dog{Enter}');
    expect(tagged().map(b => b.getAttribute('aria-label'))).toEqual(['dog']);
    // the same Enter didn't press Keep, the popup's first button
    expect(within(popup).getByRole('button', { name: 'Keep' })).toHaveAttribute('aria-pressed', 'false');
    expect(newTagButton()).toHaveFocus(); // ready for the next tag

    await user.click(newTagButton());
    await user.type(field(), 'cat');
    await user.click(within(popup).getByText('Tags')); // leaving the field (a phone's Done, or a tap elsewhere)
    expect(tagged().map(b => b.getAttribute('aria-label'))).toEqual(['cat', 'dog']);

    await user.click(newTagButton());
    await user.type(field(), 'fox{Escape}');
    expect(tagged()).toHaveLength(2); // cancelled
    expect(screen.getByRole('dialog', { name: '@bob' })).toBeInTheDocument(); // the popup stays
    expect(newTagButton()).toHaveFocus();

    await user.click(newTagButton());
    await user.click(within(popup).getByText('Tags')); // an empty field adds nothing
    expect(tagged()).toHaveLength(2);

    await user.keyboard('{Escape}'); // outside the field, Escape closes the popup as usual
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '@bob' })).not.toBeInTheDocument();
    });
  });

  test('the popup: relationship, Unavailable (fades the card, keeps an undecided account), dates', async () => {
    const { user } = await imported();
    const popup = await openAccount(user, 'bob');
    expect(within(popup).getByText('Not following back · you follow them')).toBeInTheDocument();
    expect(within(popup).getByText('Following since').nextElementSibling).toHaveTextContent(formatSince(1_700_000_000));
    expect(within(popup).getByText('Follows you since').nextElementSibling).toHaveTextContent('Not in export');
    expect(within(popup).getByText("Mark if the profile can't be opened.")).toBeInTheDocument();

    await user.click(within(popup).getByRole('checkbox', { name: /Unavailable/ }));
    expect(pressed(within(popup).getByRole('button', { name: '✓ Kept' }))).toBe(true); // marking it decides
    await closeAccount(user, 'bob');
    expect(within(row('bob')).getByText('Unavailable')).toBeInTheDocument();
    expect(row('bob')).toHaveStyle({ opacity: '0.6' });
  });

  test('nothing found: says why and offers to clear; Follows you only adds its hint; the privacy line', async () => {
    const { user } = await imported();
    const privacy = 'On your device. Never connected to Instagram.';
    expect(screen.getByText(privacy)).toBeInTheDocument();
    expect(screen.queryByText(/Queue a follower removal here/)).not.toBeInTheDocument();

    const search = screen.getByRole('searchbox', { name: 'Search accounts' });
    await user.type(search, 'zzz');
    expect(shown()).toEqual(['@alice', '@bob']); // the list waits for a pause in typing
    expect(await screen.findByRole('heading', { name: 'No accounts found' })).toBeInTheDocument();
    expect(screen.getByText('No usernames match “zzz”.')).toBeInTheDocument();
    expect(screen.queryByText(privacy)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    await applyFilters(user, 'Kept');
    expect(screen.getByText('No usernames match “zzz” with these filters.')).toBeInTheDocument();
    const noResults = () => within(screen.getByRole('region', { name: 'No accounts found' }));
    await user.click(noResults().getByRole('button', { name: 'Clear search' })); // the search box has its own ×
    expect(noResults().getByText('No accounts match these filters.')).toBeInTheDocument();
    expect(search).toHaveValue(''); // the box follows
    await user.click(noResults().getByRole('button', { name: 'Clear filters' }));
    expect(shown()).toEqual(['@alice', '@bob']);
    await user.type(search, 'bo');
    await waitFor(() => {
      expect(shown()).toEqual(['@bob']);
    });
    await user.type(search, 'b'); // the × clears at once, and the pending "bob" never lands
    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(search).toHaveValue('');
    expect(shown()).toEqual(['@alice', '@bob']);
    await new Promise(resolve => setTimeout(resolve, 300));
    expect(shown()).toEqual(['@alice', '@bob']);

    await user.click(screen.getByRole('button', { name: '1 follow you only' }));
    expect(
      screen.getByText("Queue a follower removal here. You'll make the change yourself in Instagram."),
    ).toBeInTheDocument();
    expect(cardButton('carol', 'Queue removal')).toBeInTheDocument();
  });
});

describe('unsaved changes popup', () => {
  async function imported() {
    const t = await renderApp();
    await importFiles(t.user, exportFiles());
    await findRow('bob');
    return t;
  }
  const popup = () => screen.getByRole('dialog', { name: 'Unsaved changes' });
  async function openPopup(user: UserEvent, link: string) {
    await user.click(screen.getByRole('button', { name: link }));
    return finishedOpening(waitFor(popup));
  }
  const popupClosed = () =>
    waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).not.toBeInTheDocument();
    });

  test("tag changes on top, other changes per account, only what isn't saved; a name opens the account", async () => {
    const { user } = await imported();
    await user.click(keepButton('alice'));
    await newTag(user, 'bob', 'dog');
    await user.click(cardButton('bob', 'Queue unfollow'));
    await newTag(user, 'alice', 'home');
    const accountPopup = await openAccount(user, 'alice');
    await user.click(within(accountPopup).getByRole('button', { name: 'home' })); // back again: no net change
    await closeAccount(user, 'alice');

    const p = await openPopup(user, '● Unsaved · 2 changed accounts');
    expect(within(p).getByText('2 changed accounts since the import')).toBeInTheDocument(); // never saved
    const tagRow = within(p).getByRole('button', { name: /^\+ #dog tag/ });
    expect(tagRow).toHaveTextContent('1 account ▾');
    expect(within(p).queryByText(/#home/)).not.toBeInTheDocument();
    expect(within(p).getAllByText('Needs a decision')).toHaveLength(2); // alice and bob: from …
    expect(within(p).getByText('Kept')).toBeInTheDocument(); // … to the black chip
    expect(within(p).getByText('Unfollow queued')).toBeInTheDocument(); // bob's tag is only in the tag row

    await user.click(tagRow);
    expect(tagRow).toHaveAttribute('aria-expanded', 'true');
    expect(within(p).getAllByRole('button', { name: '@bob' })).toHaveLength(2); // in the tag row and his own block
    await user.click(within(p).getAllByRole('button', { name: '@bob' })[0] as HTMLElement);
    await popupClosed();
    expect(await screen.findByRole('dialog', { name: '@bob' })).toBeInTheDocument();
  });

  test('a tag renamed on many accounts is one row that opens to 10 names, then Show all', async () => {
    const names = Array.from({ length: 12 }, (_, i) => `user${String(i + 10)}`);
    const accounts = Object.fromEntries(
      names.map(name => [
        name,
        { username: name, followingSince: 1_700_000_000, review: { unavailable: false, tags: ['dog'], notes: '' } },
      ]),
    );
    const savedAt = '2026-10-01T00:00:00.000Z';
    const master = new File(
      [JSON.stringify({ version: 1, lastSavedAt: savedAt, lastImportAt: savedAt, accounts })],
      'unfollowism_master.json',
      { type: 'application/json' },
    );
    const { user } = await renderApp();
    await importFiles(user, [master, ...exportOf(names, ['user10'])]);
    await findRow('user10');

    await openManageTags(user);
    const rename = await openTagDialog(user, 'dog', 'Rename');
    await user.type(within(rename).getByRole('textbox', { name: 'Tag name' }), '{Control>}a{/Control}pet{Enter}');
    await dialogClosed('Rename #dog');
    await closeManageTags(user);

    const p = await openPopup(user, '● Unsaved · 12 changed accounts');
    expect(within(p).getByText('12 changed accounts since your last save')).toBeInTheDocument();
    expect(within(p).queryByRole('heading', { name: 'Other changes' })).not.toBeInTheDocument();
    const rowButton = within(p).getByRole('button', { name: /^#dog → #pet/ });
    expect(rowButton).toHaveTextContent('12 accounts ▾');
    const names_ = () => within(p).queryAllByRole('button', { name: /^@user/ });
    expect(names_()).toHaveLength(0);

    await user.click(rowButton);
    expect(names_()).toHaveLength(10);
    await user.click(within(p).getByRole('button', { name: 'Show all 12' }));
    expect(names_()).toHaveLength(12);
    expect(within(p).queryByRole('button', { name: /^Show all/ })).not.toBeInTheDocument();
  });

  test('Save in the popup saves and closes it', async () => {
    const { user, downloads } = await imported();
    await user.click(keepButton('bob'));
    const p = await openPopup(user, '● Unsaved · 1 changed account');
    await user.click(within(p).getByRole('button', { name: 'Save' }));
    await popupClosed();
    expect(downloads).toHaveLength(1);
    expect(await screen.findByText(SAVED_TOAST)).toBeInTheDocument();
  });

  test('Reset changes in the popup asks, undoes what is listed and closes it', async () => {
    const { user } = await imported();
    await user.click(keepButton('bob'));
    const p = await openPopup(user, '● Unsaved · 1 changed account');
    await user.click(within(p).getByRole('button', { name: 'Reset changes' }));
    const confirmReset = await finishedOpening(screen.findByRole('alertdialog'));
    await user.click(within(confirmReset).getByRole('button', { name: 'Reset changes' }));
    await popupClosed();
    expect(isKept('bob')).toBe(false);
  });

  test('only a new import: nothing per account, Save on, Reset off', async () => {
    const { user } = await imported();
    const p = await openPopup(user, '● New import not saved');
    expect(within(p).getByText('New import, no account changes')).toBeInTheDocument();
    expect(within(p).getByRole('button', { name: 'Save' })).toBeEnabled();
    expect(within(p).getByRole('button', { name: 'Reset changes' })).toBeDisabled();
  });
});

test('every form field has a name (browsers flag unnamed fields)', async () => {
  const unnamed = () =>
    [...document.querySelectorAll('input, select, textarea')]
      .filter(field => !field.getAttribute('name'))
      .map(field => field.outerHTML);
  const { user } = await renderApp();
  expect(unnamed()).toEqual([]); // import screen

  await importFiles(user, exportFiles());
  await findRow('bob');
  expect(unnamed()).toEqual([]); // main view
  const popup = await openAccount(user, 'bob');
  await user.click(within(popup).getByRole('button', { name: '+ New tag' }));
  expect(unnamed()).toEqual([]); // account popup: unavailable switch, note, new tag
});

describe('tags', () => {
  async function imported() {
    const t = await renderApp();
    await importFiles(t.user, exportFiles());
    await findRow('bob');
    return t;
  }
  /** The tag chips in an account's popup (its buttons in the Tags group besides "+ New tag"). */
  async function popupTags(user: UserEvent, username: string) {
    const popup = await openAccount(user, username);
    const chips = within(within(popup).getByRole('group', { name: `Tags for @${username}` }))
      .queryAllByRole('button')
      .filter(b => b.textContent !== '+ New tag')
      .map(b => `${b.getAttribute('aria-label') ?? ''}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`);
    await closeAccount(user, username);
    return chips;
  }

  test('+ New tag creates a tag on that account; it then shows in every popup and reuses its case', async () => {
    const { user } = await imported();
    expect(await popupTags(user, 'alice')).toEqual([]);
    await newTag(user, 'alice', 'Artist');
    expect(await popupTags(user, 'alice')).toEqual(['Artist ✓']);
    expect(await popupTags(user, 'bob')).toEqual(['Artist']);
    expect(within(row('alice')).getByText('#Artist')).toBeInTheDocument(); // the card shows its tags as text

    await newTag(user, 'bob', '  artist ');
    expect(await popupTags(user, 'bob')).toEqual(['Artist ✓']);
  });

  test('Manage tags: rename, merge and delete, with counts', async () => {
    const { user } = await imported();
    // From the Filter popup, Manage tags replaces it.
    const filter = await openFilterPopup(user);
    await user.click(within(filter).getByRole('button', { name: 'Manage tags' }));
    await filterClosed();
    const empty = await finishedOpening(screen.findByRole('dialog', { name: 'Manage tags' }));
    expect(within(empty).getByText('Your tags are only for you.')).toBeInTheDocument();
    expect(
      within(empty).getByText('No tags yet. New tags are made on an account: open it and tap + New tag.'),
    ).toBeInTheDocument();
    await closeManageTags(user);

    await newTag(user, 'alice', 'dog');
    await newTag(user, 'bob', 'dog');
    await newTag(user, 'bob', 'illustration');
    const popup = await openManageTags(user);
    expect(within(lineOf(popup, 'dog')).getByText('2 accounts')).toBeInTheDocument();
    expect(within(lineOf(popup, 'illustration')).getByText('1 account')).toBeInTheDocument();

    // Rename: off while the name is empty; a new name applies to every account with the tag.
    let rename = await openTagDialog(user, 'dog', 'Rename');
    const field = within(rename).getByRole('textbox', { name: 'Tag name' });
    expect(field).toHaveValue('dog');
    await user.clear(field);
    expect(within(rename).getByRole('button', { name: 'Rename' })).toBeDisabled();
    await user.type(field, 'dogs');
    await user.click(within(rename).getByRole('button', { name: 'Rename' }));
    await dialogClosed('Rename #dog');
    expect(within(lineOf(popup, 'dogs')).getByText('2 accounts')).toBeInTheDocument();

    // Onto an existing tag (any case): a warning, and the button merges.
    rename = await openTagDialog(user, 'illustration', 'Rename');
    await user.type(within(rename).getByRole('textbox', { name: 'Tag name' }), '{Control>}a{/Control}Dogs');
    expect(within(rename).getByText('⚠ #dogs already exists')).toBeInTheDocument();
    expect(within(rename).getByText('Saving merges the two tags: the account gets #dogs.')).toBeInTheDocument();
    await user.click(within(rename).getByRole('button', { name: 'Merge' }));
    await dialogClosed('Rename #illustration');
    expect(within(popup).queryByText('#illustration')).not.toBeInTheDocument();
    expect(within(lineOf(popup, 'dogs')).getByText('2 accounts')).toBeInTheDocument();

    // Delete asks with the count.
    const confirmDelete = await openTagDialog(user, 'dogs', 'Delete');
    expect(within(confirmDelete).getByRole('heading', { name: 'Delete #dogs?' })).toBeInTheDocument();
    expect(
      within(confirmDelete).getByText('It will be removed from 2 accounts. Their decisions and notes stay.'),
    ).toBeInTheDocument();
    await user.click(within(confirmDelete).getByRole('button', { name: 'Delete' }));
    expect(await within(popup).findByText(/^No tags yet/)).toBeInTheDocument();

    await closeManageTags(user);
    expect(row('alice')).not.toHaveTextContent('#');
    expect(row('bob')).not.toHaveTextContent('#');
  });
});

test('Changes compares with the saved master: numbers, sections, badges, Show all and the popup', async () => {
  let clock = Date.parse('2026-10-27T12:00:00.000Z');
  const { user, downloads } = await renderApp({ now: () => new Date((clock += 60_000)) });
  await importFiles(user, exportOf(['alice', 'bob', 'dan'], ['alice', 'carol']));
  await findRow('alice');
  await user.click(cardButton('bob', 'Queue unfollow'));
  await user.click(saveButton());
  await waitFor(() => {
    expect(downloads).toHaveLength(1);
  });

  // You unfollowed bob as planned, followed four new accounts; carol left.
  await fromMenu(user, 'Import new files');
  const master = new File([must(downloads[0]).text], 'unfollowism_master.json', { type: 'application/json' });
  await importFiles(user, [master, ...exportOf(['alice', 'dan', 'gus', 'hal', 'ivy', 'jo'], ['alice'])]);
  await findRow('alice');
  await user.click(navItem(/^Changes 6$/));

  expect(screen.getByText(/^6 changes since /)).toBeInTheDocument();
  const compared = screen.getByRole('region', { name: 'Compared files' });
  expect(within(compared).getByText('3 → 6')).toBeInTheDocument(); // following
  expect(within(compared).getByText('2 → 1')).toBeInTheDocument(); // followers
  const sectionTitles = screen
    .getAllByRole('region')
    .filter(region => region.hasAttribute('aria-labelledby'))
    .map(region => within(region).getByRole('heading').textContent);
  // New followers is empty, so hidden.
  expect(sectionTitles).toEqual(['No longer follow you', 'You started following', 'You stopped following']);
  expect(rowsOf('No longer follow you')).toEqual(['@carol']);
  expect(within(section('You stopped following')).getByText('You unfollowed')).toBeInTheDocument();

  expect(rowsOf('You started following')).toEqual(['@gus', '@hal', '@ivy']);
  await user.click(screen.getByRole('button', { name: 'Show all 4' }));
  expect(rowsOf('You started following')).toEqual(['@gus', '@hal', '@ivy', '@jo']);
  await user.click(screen.getByRole('button', { name: 'Show fewer' }));
  expect(rowsOf('You started following')).toEqual(['@gus', '@hal', '@ivy']);

  // A row opens the account popup. A queued plan shows on the row; Kept doesn't (nothing left to do).
  const gus = () => within(section('You started following')).getByRole('listitem', { name: '@gus' });
  await user.click(screen.getByRole('button', { name: 'Open @gus' }));
  let popup = await finishedOpening(screen.findByRole('dialog', { name: '@gus' }));
  await user.click(within(popup).getByRole('button', { name: 'Queue unfollow' }));
  await closeAccount(user, 'gus');
  expect(gus()).toHaveTextContent('@gusUnfollow queued');
  await user.click(screen.getByRole('button', { name: 'Open @gus' }));
  popup = await finishedOpening(screen.findByRole('dialog', { name: '@gus' }));
  await user.click(within(popup).getByRole('button', { name: 'Keep' }));
  await closeAccount(user, 'gus');
  expect(gus()).not.toHaveTextContent(/Kept|queued/);
});

test('someone you kept who stops following you needs a decision again; past accounts have none', async () => {
  let clock = Date.parse('2026-10-27T12:00:00.000Z');
  const { user, downloads } = await renderApp({ now: () => new Date((clock += 60_000)) });
  await importFiles(user, exportOf(['alice', 'bob'], ['alice', 'carol']));
  await findRow('alice');
  await user.click(keepButton('alice'));
  await user.click(keepButton('bob'));
  await user.click(saveButton());
  await waitFor(() => {
    expect(downloads).toHaveLength(1);
  });

  // alice stops following you; you unfollow bob, who never followed you: bob is now a past account
  await fromMenu(user, 'Import new files');
  const master = new File([must(downloads[0]).text], 'unfollowism_master.json', { type: 'application/json' });
  await importFiles(user, [master, ...exportOf(['alice'], ['carol'])]);
  await findRow('alice');
  expect(isKept('alice')).toBe(false);
  expect(queryRow('bob')).not.toBeInTheDocument(); // not in Following any more

  await applyFilters(user, 'Everyone incl. past accounts');
  expect(within(row('bob')).queryByRole('button', { name: /Keep|Kept/ })).not.toBeInTheDocument();
  const popup = await openAccount(user, 'bob');
  expect(within(popup).queryByText('Your decision')).not.toBeInTheDocument();
});

test('a renamed follower is suggested in No longer follow you, and confirming moves its work', async () => {
  const datedExport = (followers: [string, number][]) => [
    new File([JSON.stringify(followingFile(['alice', 101], ['bob', 102]))], 'following.json', {
      type: 'application/json',
    }),
    new File([JSON.stringify(followersFile(...followers))], 'followers_1.json', { type: 'application/json' }),
  ];
  let clock = Date.parse('2026-10-27T12:00:00.000Z');
  const now = () => new Date((clock += 60_000)); // the next import comes after the save
  const first = await renderApp({ now });
  const { downloads } = first;
  let user = first.user;
  await importFiles(
    user,
    datedExport([
      ['alice', 201],
      ['carol', 203],
    ]),
  );
  await findRow('alice');
  await applyFilters(user, 'Followers');
  await findRow('carol');
  await user.click(keepButton('carol'));
  await user.click(saveButton());
  await waitFor(() => {
    expect(downloads).toHaveLength(1);
  });

  await fromMenu(user, 'Import new files');
  const master = new File([must(downloads[0]).text], 'unfollowism_master.json', { type: 'application/json' });
  await importFiles(user, [
    master,
    ...datedExport([
      ['alice', 201],
      ['carol_2', 203],
    ]),
  ]);
  expect(await findRow('carol_2')).toBeInTheDocument();
  expect(screen.queryByText(/Looks renamed/)).not.toBeInTheDocument(); // only in No longer follow you, on Changes

  // A reload keeps the suggestion, like any unsaved edit.
  await waitFor(async () => {
    expect((await first.tab.load())?.base).toMatchObject({
      accounts: { carol: { renameSuggestion: { to: 'carol_2' } } },
    });
  });
  first.unmount();
  user = (await renderApp({ tab: first.tab, now })).user;

  await user.click(await screen.findByRole('button', { name: /^Changes/ }));
  expect(rowsOf('No longer follow you')).toEqual(['@carol']);
  const card = within(section('No longer follow you')).getByRole('listitem', { name: '@carol' });
  expect(within(card).getByRole('note')).toHaveTextContent('⚠ Looks renamed to @carol_2: same follow dates.');
  await user.click(within(card).getByRole('button', { name: 'Move to @carol_2' }));
  await waitFor(() => {
    expect(screen.queryByRole('region', { name: 'No longer follow you' })).not.toBeInTheDocument();
  });

  await user.click(navItem(/^Review$/));
  await applyFilters(user, 'Followers'); // filters start fresh after the reload
  await findRow('carol_2');
  expect(isKept('carol_2')).toBe(true);
});
