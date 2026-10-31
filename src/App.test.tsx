import { ChakraProvider } from '@chakra-ui/react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { IDBFactory, IDBKeyRange } from 'fake-indexeddb';
import { Provider } from 'react-redux';

import { App } from './App.tsx';
import { followersFile, followingFile, must } from './core/__tests__/helpers.ts';
import { memoryLastSaved } from './io/lastSaved.ts';
import { createMemoryTabDatabase, openIndexedDbTabDatabase, type TabStore } from './io/tabStore.ts';
import type { StoreDeps } from './store/deps.ts';
import { makeStore } from './store/index.ts';
import { system } from './theme.ts';
import { formatSince } from './ui/dates.ts';
import { DialogProvider } from './ui/dialogs.tsx';

async function renderApp({
  tab = openIndexedDbTabDatabase(new IDBFactory(), IDBKeyRange).forTab('tab-1'),
  lastSaved = memoryLastSaved(),
  waitForRestore = true,
  now = () => new Date('2026-10-27T12:00:00.000Z'),
} = {}) {
  const downloads: { filename: string; text: string }[] = [];
  const deps: StoreDeps = {
    now,
    download: (filename, text) => {
      downloads.push({ filename, text });
    },
    tab,
    lastSaved,
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

/** Opens a filter dropdown of the change and To do tabs and picks an option by its label. */
async function chooseFilter(user: UserEvent, name: string, option: string) {
  await user.click(screen.getByRole('combobox', { name }));
  await user.click(await screen.findByRole('option', { name: optionName(option) }));
}

/** Review: opens the Filter sheet. */
async function openFilterSheet(user: UserEvent) {
  await user.click(screen.getByRole('button', { name: /^Filter( \d)?$/ }));
  return screen.findByRole('dialog', { name: 'Filter' });
}

async function sheetClosed() {
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: 'Filter' })).not.toBeInTheDocument();
  });
}

/** Review: picks options in the Filter sheet (list, tag, decision) and applies them with "Show N accounts". */
async function applyFilters(user: UserEvent, ...options: string[]) {
  const sheet = await openFilterSheet(user);
  for (const option of options) {
    await user.click(within(sheet).getByRole('button', { name: optionName(option) }));
  }
  await user.click(within(sheet).getByRole('button', { name: /^Show \d+ accounts?$/ }));
  await sheetClosed();
}

/** Review: opens an account's sheet from its card. */
async function openAccount(user: UserEvent, username: string) {
  await user.click(within(row(username)).getByRole('button', { name: `Open @${username}` }));
  return screen.findByRole('dialog', { name: `@${username}` });
}

async function closeAccount(user: UserEvent, username: string) {
  await user.click(within(screen.getByRole('dialog', { name: `@${username}` })).getByRole('button', { name: 'Close' }));
  await waitFor(() => {
    expect(screen.queryByRole('dialog', { name: `@${username}` })).not.toBeInTheDocument();
  });
}

/** Review: creates a tag with "+ New tag" in the account's sheet (new masters start without tags). */
async function newTag(user: UserEvent, username: string, tag: string) {
  const sheet = await openAccount(user, username);
  await user.click(within(sheet).getByRole('button', { name: '+ New tag' }));
  await user.type(within(sheet).getByRole('textbox', { name: `New tag for @${username}` }), `${tag}{Enter}`);
  await closeAccount(user, username);
}

/** Change tabs: creates a tag with "+ tag" on the old card. */
async function newTagOnCard(user: UserEvent, username: string, tag: string) {
  await user.click(within(row(username)).getByRole('button', { name: '+ tag' }));
  await user.type(within(row(username)).getByRole('textbox', { name: `New tag for @${username}` }), `${tag}{Enter}`);
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

test('starts on the import screen', async () => {
  await renderApp();
  expect(screen.getByRole('heading', { name: 'Unfollowism' })).toBeInTheDocument();
  expect(screen.getByText('Drop your Instagram export here')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Choose files' })).toBeEnabled();
  expect(importButton()).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Save master' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Reset changes' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Import files' })).not.toBeInTheDocument();
});

test('the ? button explains how to get the export', async () => {
  const { user } = await renderApp();
  await user.click(screen.getByRole('button', { name: 'How to get your Instagram export' }));
  const dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByText('JSON')).toBeInTheDocument();
  expect(within(dialog).getByText('All time')).toBeInTheDocument();
});

test('import → review → save works end to end', async () => {
  const { downloads, user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), exportFiles());
  expect(
    await screen.findByText('Following ✓ · Followers ✓ (1 file) · Master: none — a new one will be started'),
  ).toBeInTheDocument();
  await user.click(importButton());

  expect(await screen.findByText(/Started a new master/)).toBeInTheDocument();
  expect(screen.queryByText('Drop your Instagram export here')).not.toBeInTheDocument();
  expect(stat('Following')).toBe('2');
  expect(stat('Mutual')).toBe('1');
  expect(row('alice')).toBeInTheDocument();
  expect(queryRow('carol')).not.toBeInTheDocument(); // the Review tab starts on "Following"
  expect(listChip()).toHaveTextContent('Following ▾');

  await user.click(keepButton('bob'));
  await user.click(screen.getByRole('button', { name: 'Save master' }));
  await waitFor(() => {
    expect(downloads).toHaveLength(1);
  });
  const saved = JSON.parse(downloads[0]?.text ?? '{}') as {
    accounts: Record<string, { decision?: { kind: string } }>;
  };
  expect(saved.accounts.bob?.decision).toEqual({ kind: 'kept' });
  expect(screen.getByText('Saved')).toBeInTheDocument();
});

test('a missing Followers file is shown and Import stays disabled', async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), [followingJson()]);
  expect(await screen.findByText(/^Following ✓ · Followers ✗/)).toBeInTheDocument();
  expect(screen.getByText(/followers_1\.json .* is missing/)).toBeInTheDocument();
  expect(importButton()).toBeDisabled();
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

  fireEvent.drop(screen.getByText('Drop your Instagram export here'), { dataTransfer: { files: exportFiles() } });
  expect(await screen.findByText(/^Following ✓ · Followers ✓/)).toBeInTheDocument();

  await user.click(importButton());
  await findRow('alice');
  expect(browserHandlesDrop(row('alice'))).toBe(false); // the main view has no drop zone at all
});

const masterJson = (savedAt: string, name = 'unfollowism_master.json') =>
  new File([JSON.stringify({ version: 1, lastSavedAt: savedAt, lastImportAt: savedAt, accounts: {} })], name, {
    type: 'application/json',
  });

test('files chosen one after another add up, e.g. a master from another folder', async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), exportFiles());
  expect(await screen.findByText(/Master: none/)).toBeInTheDocument();

  await user.upload(screen.getByTestId('file-input'), [masterJson('2026-10-01T00:00:00.000Z')]);
  expect(
    await screen.findByText(/^Following ✓ · Followers ✓ \(1 file\) · Master: unfollowism_master\.json \(saved/),
  ).toBeInTheDocument();
  expect(screen.getByText('following.json')).toBeInTheDocument();
  expect(screen.getByText('followers_1.json')).toBeInTheDocument();
  expect(importButton()).toBeEnabled();
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
  expect(await screen.findByText(/^Following ✓ · Followers ✗/)).toBeInTheDocument();
  expect(importButton()).toBeDisabled();

  await user.click(screen.getByRole('button', { name: 'Clear all' }));
  expect(screen.queryByText('following.json')).not.toBeInTheDocument();
  expect(screen.queryByText(/^Following/)).not.toBeInTheDocument();
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
  expect(await screen.findByText(/Master: new\.json/)).toBeInTheDocument();
  expect(screen.queryByText(/Found 2 master files/)).not.toBeInTheDocument();
  expect(importButton()).toBeEnabled();
});

test("a selection that can't be imported shows a readable error", async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), [
    new File(['<html>'], 'following.html', { type: 'text/html' }),
    new File(['<html>'], 'followers_1.html', { type: 'text/html' }),
  ]);
  expect(await screen.findByText(/This export is in HTML format/)).toBeInTheDocument();
  expect(importButton()).toBeDisabled();
});

const savedBefore = () => {
  const lastSaved = memoryLastSaved();
  lastSaved.set('2026-10-20T00:00:00.000Z');
  return lastSaved;
};

test('without a master, a previous save is only a hint while choosing; Import asks first', async () => {
  const { user } = await renderApp({ lastSaved: savedBefore() });
  await user.upload(screen.getByTestId('file-input'), exportFiles());
  expect(
    await screen.findByText(/Master: none — add the one you saved on .*, or a new one will be started/),
  ).toBeInTheDocument();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument(); // no warning box while still choosing

  await user.click(importButton());
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText('Import without your master?')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(screen.getByText('Drop your Instagram export here')).toBeInTheDocument(); // nothing imported

  await user.click(importButton());
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Import anyway' }));
  expect(await findRow('bob')).toBeInTheDocument();
});

test('an older master is warned about as soon as it is added', async () => {
  const { user } = await renderApp({ lastSaved: savedBefore() });
  await user.upload(screen.getByTestId('file-input'), [...exportFiles(), masterJson('2026-10-01T00:00:00.000Z')]);
  expect(
    await screen.findByText(/The chosen master is older than the one you saved from this browser/),
  ).toBeInTheDocument();
  expect(importButton()).toBeEnabled();
});

test('Import files can be cancelled', async () => {
  const { user } = await renderApp();
  await importFiles(user, exportFiles());
  await user.click(await screen.findByRole('button', { name: 'Import files' }));
  expect(screen.getByText('Drop your Instagram export here')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(row('bob')).toBeInTheDocument();
});

test('importing over unsaved work asks first', async () => {
  const { user } = await renderApp();
  await importFiles(user, exportFiles());
  await findRow('bob');
  await user.click(keepButton('bob'));

  await user.click(screen.getByRole('button', { name: 'Import files' }));
  await importFiles(user, exportFiles());
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText('Discard unsaved changes?')).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(screen.getByText('Drop your Instagram export here')).toBeInTheDocument(); // nothing imported

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
  expect(screen.getByRole('button', { name: 'Unsaved changes (1)' })).toBeInTheDocument();
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
  expect(screen.getByText('Loading your work…')).toBeInTheDocument();
  expect(screen.queryByText('Drop your Instagram export here')).not.toBeInTheDocument();
  release();
  expect(await findRow('bob')).toBeInTheDocument();
});

test("work that can't be restored after a reload is reported on the import screen", async () => {
  const tab = openIndexedDbTabDatabase(new IDBFactory(), IDBKeyRange).forTab('tab-1');
  const { user } = await renderApp({ tab: { ...tab, load: () => Promise.reject(new Error('unreadable')) } });
  expect(screen.getByText(/couldn't be restored/)).toBeInTheDocument();

  await importFiles(user, exportFiles());
  expect(await findRow('bob')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Import files' }));
  expect(screen.queryByText(/couldn't be restored/)).not.toBeInTheDocument();
});

test("Import shows that it's working", async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId('file-input'), exportFiles());
  await waitFor(() => {
    expect(importButton()).toBeEnabled();
  });
  await user.click(importButton());
  expect(screen.getByText(/Importing… large accounts can take a few seconds/)).toBeInTheDocument();
  expect(await findRow('bob')).toBeInTheDocument();
});

test('Reset changes asks first, then undoes unsaved work', async () => {
  const { user } = await renderApp();
  await importFiles(user, exportFiles());
  await findRow('bob');
  const reset = screen.getByRole('button', { name: 'Reset changes' });
  expect(reset).toBeDisabled();

  await user.click(keepButton('bob'));
  expect(isKept('bob')).toBe(true);
  expect(reset).toBeEnabled();

  await user.click(reset);
  const dialog = await screen.findByRole('alertdialog');
  expect(within(dialog).getByText(/Changes to 1 account since your last save/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  await waitFor(() => {
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
  expect(isKept('bob')).toBe(true);

  await user.click(reset);
  await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reset' }));
  await waitFor(() => {
    expect(isKept('bob')).toBe(false);
  });
  expect(reset).toBeDisabled();
});

describe('main view', () => {
  // exportFiles(): following alice + bob, followers alice + carol. Without a saved master everyone counts as new.
  async function imported() {
    const t = await renderApp();
    await importFiles(t.user, exportFiles());
    await findRow('bob');
    return t;
  }
  const tab = (name: RegExp) => screen.getByRole('button', { name });
  const choose = (user: UserEvent, name: string, option: string) => chooseFilter(user, name, option);
  const shown = () => screen.queryAllByRole('article').map(card => card.getAttribute('aria-label'));

  test('tabs switch lists; empty tabs are disabled', async () => {
    const { user } = await imported();
    expect(shown()).toEqual(['@alice', '@bob']);
    expect(tab(/^I unfollowed \(0\)$/)).toBeDisabled();
    expect(tab(/^To do \(0\)$/)).toBeDisabled();

    await user.click(tab(/^New followers \(2\)$/));
    expect(shown()).toEqual(['@alice', '@carol']);
    expect(screen.getByText('2 accounts started following you since you started')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Change list$/ })).not.toBeInTheDocument(); // the list is Review-only
  });

  test('search, status and tag narrow the list and are kept across tabs', async () => {
    const { user } = await imported();
    await user.type(screen.getByRole('searchbox', { name: 'Search accounts' }), 'bo');
    expect(shown()).toEqual(['@bob']);
    await user.click(tab(/^New follows/));
    expect(shown()).toEqual(['@bob']);
    await user.clear(screen.getByRole('textbox', { name: 'Search username' }));

    await newTagOnCard(user, 'alice', 'artist');
    await choose(user, 'Tag', 'artist');
    expect(shown()).toEqual(['@alice']);
    await choose(user, 'Tag', 'No tags');
    expect(shown()).toEqual(['@bob']);
    await user.click(tab(/^Review$/));
    expect(shown()).toEqual(['@bob']);
    expect(screen.getByRole('button', { name: 'Remove filter No tags' })).toBeInTheDocument();
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

  test('Filter sheet: choices apply only on Show N accounts; × forgets them; the list chip opens it', async () => {
    const { user } = await imported();
    const sheet = await openFilterSheet(user);
    const option = (label: string) => within(sheet).getByRole('button', { name: optionName(label) });
    expect(option('Following')).toHaveTextContent('Following2');
    expect(option('Following')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Everyone now')).toHaveTextContent('Everyone now3');
    expect(option('Any tag')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Any')).toHaveAttribute('aria-pressed', 'true');
    expect(within(sheet).getByRole('button', { name: 'Show 2 accounts' })).toBeInTheDocument();

    await user.click(option('Mutual'));
    await user.click(option('Needs a decision'));
    expect(option('Mutual')).toHaveAttribute('aria-pressed', 'true');
    expect(option('Following')).toHaveAttribute('aria-pressed', 'false');
    expect(within(sheet).getByRole('button', { name: 'Show 1 account' })).toBeInTheDocument(); // counts the draft
    // the list behind doesn't change yet (it's hidden from screen readers while the sheet is open)
    const behind = screen.queryAllByRole('article', { hidden: true }).map(card => card.getAttribute('aria-label'));
    expect(behind).toEqual(['@alice', '@bob']);

    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await sheetClosed();
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

    // Reset in the sheet does the same: filters back to any, the list stays.
    const sheet = await openFilterSheet(user);
    await user.click(within(sheet).getByRole('button', { name: optionName('artist') }));
    await user.click(within(sheet).getByRole('button', { name: 'Kept' }));
    await user.click(within(sheet).getByRole('button', { name: 'Reset' }));
    expect(within(sheet).getByRole('button', { name: 'Any tag' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sheet).getByRole('button', { name: 'Any' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(sheet).getByRole('button', { name: optionName('Mutual') })).toHaveAttribute('aria-pressed', 'true');
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

  test('plans: offered only when the follow exists; To do → Mark done leaves the list on refresh', async () => {
    const { user } = await imported();
    await applyFilters(user, 'Everyone now');
    // The sheet offers each plan whose follow exists: alice (mutual) both, bob only unfollow, carol only removal.
    const queueOptions = async (username: string) => {
      const sheet = await openAccount(user, username);
      const names = within(sheet)
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
    await user.click(tab(/^To do \(1\)$/));
    expect(shown()).toEqual(['@bob']); // the decision filter doesn't apply in To do…
    expect(screen.queryByRole('combobox', { name: 'Your decision' })).not.toBeInTheDocument(); // …so it's hidden there
    expect(screen.getByText('1 to unfollow')).toBeInTheDocument();

    // a compact row: no tags and no note
    expect(within(row('bob')).queryByRole('button', { name: 'dog' })).not.toBeInTheDocument();
    expect(within(row('bob')).queryByRole('textbox')).not.toBeInTheDocument();
    await user.click(within(row('bob')).getByRole('button', { name: 'Mark done' }));
    expect(within(row('bob')).getByText('✓ Done')).toBeInTheDocument();
    expect(screen.getByText('0 to unfollow · 1 done, waiting for the next import')).toBeInTheDocument();
    expect(shown()).toEqual(['@bob']); // stays until the list refreshes

    await user.click(within(row('bob')).getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('1 to unfollow')).toBeInTheDocument();
    await user.click(within(row('bob')).getByRole('button', { name: 'Mark done' }));
    await user.click(tab(/^Review$/));
    expect(tab(/^To do \(0\)$/)).toBeDisabled();
    await applyFilters(user, 'Any');
    // marked done in To do, waiting for the next import: the card says so; tapping it would undo the plan
    expect(cardButton('bob', '✓ Unfollow done')).toHaveAttribute('aria-pressed', 'true');
  });

  test('To do → Keep removes the plan; Undo brings it back', async () => {
    const { user } = await imported();
    await newTag(user, 'alice', 'artist');
    await user.click(cardButton('alice', 'Queue unfollow'));
    await user.click(cardButton('bob', 'Queue unfollow'));
    await user.click(tab(/^To do \(2\)$/));
    expect(within(row('alice')).getByText('artist')).toBeInTheDocument(); // its tags, read-only
    expect(within(row('alice')).queryByRole('button', { name: 'artist' })).not.toBeInTheDocument();

    await user.click(within(row('alice')).getByRole('button', { name: 'Keep' }));
    expect(within(row('alice')).getByText('Kept')).toBeInTheDocument();
    expect(tab(/^To do \(1\)$/)).toBeInTheDocument();
    await user.click(within(row('alice')).getByRole('button', { name: 'Undo' }));
    expect(tab(/^To do \(2\)$/)).toBeInTheDocument();

    await user.click(within(row('alice')).getByRole('button', { name: 'Keep' }));
    await user.click(tab(/^Review$/)); // refresh the list
    await user.click(tab(/^To do \(1\)$/));
    expect(shown()).toEqual(['@bob']);
  });

  test('tags and notes end up in the saved master', async () => {
    const { user, downloads } = await imported();
    await newTag(user, 'bob', 'dog');
    const sheet = await openAccount(user, 'bob');
    await user.type(within(sheet).getByRole('textbox', { name: 'Note for @bob' }), 'met at a show');
    await closeAccount(user, 'bob'); // closing mid-pause still stores the note
    await user.click(screen.getByRole('button', { name: 'Save master' }));
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
    const sheet = await openAccount(user, 'bob');
    const link = within(sheet).getByRole('link', { name: 'Open in Instagram ↗' });
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

describe('Review cards and the account sheet', () => {
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

  test('a card shows a plan queued in the sheet; "Both queued" opens the sheet; Keep there clears both', async () => {
    const { user } = await imported();
    let sheet = await openAccount(user, 'alice'); // mutual: both plans possible
    await user.click(within(sheet).getByRole('button', { name: 'Queue removal' }));
    expect(within(sheet).getByRole('button', { name: '✓ Removal queued' })).toBeInTheDocument();
    await closeAccount(user, 'alice');
    expect(cardButton('alice', '✓ Removal queued')).toHaveAttribute('aria-pressed', 'true'); // not "Queue unfollow"
    await user.click(cardButton('alice', '✓ Removal queued')); // undoes it
    expect(cardButton('alice', 'Queue unfollow')).toBeInTheDocument();

    sheet = await openAccount(user, 'alice');
    await user.click(within(sheet).getByRole('button', { name: 'Queue unfollow' }));
    await user.click(within(sheet).getByRole('button', { name: 'Queue removal' }));
    await closeAccount(user, 'alice');
    await user.click(cardButton('alice', '✓ Both queued'));
    sheet = await screen.findByRole('dialog', { name: '@alice' });
    expect(within(sheet).getByRole('button', { name: '✓ Unfollow queued' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: '✓ Removal queued' })).toBeInTheDocument();

    await user.click(within(sheet).getByRole('button', { name: 'Keep' }));
    expect(pressed(within(sheet).getByRole('button', { name: '✓ Kept' }))).toBe(true);
    expect(within(sheet).getByRole('button', { name: 'Queue unfollow' })).toBeInTheDocument();
    expect(within(sheet).getByRole('button', { name: 'Queue removal' })).toBeInTheDocument();
    expect(within(sheet).getByText('Queue one or both. Keep clears them.')).toBeInTheDocument();
  });

  test("+ New tag: Enter (the phone's Done) or leaving the field adds it; Escape cancels, not the sheet", async () => {
    const { user } = await imported();
    const sheet = await openAccount(user, 'bob');
    const field = () => within(sheet).getByRole('textbox', { name: 'New tag for @bob' });
    const newTagButton = () => within(sheet).getByRole('button', { name: '+ New tag' });
    const tagged = () =>
      within(within(sheet).getByRole('group', { name: 'Tags for @bob' })).queryAllByRole('button', { pressed: true });

    await user.click(newTagButton());
    expect(field()).toHaveAttribute('enterkeyhint', 'done');
    await user.type(field(), 'dog{Enter}');
    expect(tagged().map(b => b.getAttribute('aria-label'))).toEqual(['dog']);
    // the same Enter didn't press Keep, the sheet's first button
    expect(within(sheet).getByRole('button', { name: 'Keep' })).toHaveAttribute('aria-pressed', 'false');
    expect(newTagButton()).toHaveFocus(); // ready for the next tag

    await user.click(newTagButton());
    await user.type(field(), 'cat');
    await user.click(within(sheet).getByText('Tags')); // leaving the field (a phone's Done, or a tap elsewhere)
    expect(tagged().map(b => b.getAttribute('aria-label'))).toEqual(['cat', 'dog']);

    await user.click(newTagButton());
    await user.type(field(), 'fox{Escape}');
    expect(tagged()).toHaveLength(2); // cancelled
    expect(screen.getByRole('dialog', { name: '@bob' })).toBeInTheDocument(); // the sheet stays
    expect(newTagButton()).toHaveFocus();

    await user.click(newTagButton());
    await user.click(within(sheet).getByText('Tags')); // an empty field adds nothing
    expect(tagged()).toHaveLength(2);

    await user.keyboard('{Escape}'); // outside the field, Escape closes the sheet as usual
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: '@bob' })).not.toBeInTheDocument();
    });
  });

  test('the sheet: relationship, Unavailable (fades the card, counts as reviewed), dates', async () => {
    const { user } = await imported();
    const sheet = await openAccount(user, 'bob');
    expect(within(sheet).getByText('Not following back · you follow them')).toBeInTheDocument();
    expect(within(sheet).getByText('Following since').nextElementSibling).toHaveTextContent(formatSince(1_700_000_000));
    expect(within(sheet).getByText('Follows you since').nextElementSibling).toHaveTextContent('Not in export');
    expect(within(sheet).getByText("Mark if the profile can't be opened.")).toBeInTheDocument();

    await user.click(within(sheet).getByRole('checkbox', { name: /Unavailable/ }));
    expect(pressed(within(sheet).getByRole('button', { name: '✓ Kept' }))).toBe(true); // marking it decides
    await closeAccount(user, 'bob');
    expect(within(row('bob')).getByText('Unavailable')).toBeInTheDocument();
    expect(row('bob')).toHaveStyle({ opacity: '0.6' });
  });

  test('nothing found: says why and offers to clear; Follows you only adds its hint; the privacy line', async () => {
    const { user } = await imported();
    const privacy = 'On your device. Never connected to Instagram.';
    expect(screen.getByText(privacy)).toBeInTheDocument();
    expect(screen.queryByText(/Queue a follower removal here/)).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox', { name: 'Search accounts' }), 'zzz');
    expect(screen.getByRole('heading', { name: 'No accounts found' })).toBeInTheDocument();
    expect(screen.getByText('No usernames match “zzz”.')).toBeInTheDocument();
    expect(screen.queryByText(privacy)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Clear filters' })).not.toBeInTheDocument();
    await applyFilters(user, 'Kept');
    expect(screen.getByText('No usernames match “zzz” with these filters.')).toBeInTheDocument();
    const noResults = () => within(screen.getByRole('region', { name: 'No accounts found' }));
    await user.click(noResults().getByRole('button', { name: 'Clear search' })); // the search box has its own ×
    expect(noResults().getByText('No accounts match these filters.')).toBeInTheDocument();
    await user.click(noResults().getByRole('button', { name: 'Clear filters' }));
    expect(shown()).toEqual(['@alice', '@bob']);

    await user.click(screen.getByRole('button', { name: '1 follow you only' }));
    expect(
      screen.getByText("Queue a follower removal here. You'll make the change yourself in Instagram."),
    ).toBeInTheDocument();
    expect(cardButton('carol', 'Queue removal')).toBeInTheDocument();
  });
});

describe('unsaved changes drawer', () => {
  async function imported() {
    const t = await renderApp();
    await importFiles(t.user, exportFiles());
    await findRow('bob');
    return t;
  }
  const drawer = () => screen.getByRole('dialog', { name: 'Unsaved changes' });

  test("lists net changes per account, by category, and only what isn't saved", async () => {
    const { user, downloads } = await imported();
    await user.click(keepButton('alice'));
    await newTag(user, 'bob', 'dog');
    await user.click(cardButton('bob', 'Queue unfollow'));
    await newTag(user, 'alice', 'home');
    const sheet = await openAccount(user, 'alice');
    await user.click(within(sheet).getByRole('button', { name: 'home' })); // back again: no net change
    await closeAccount(user, 'alice');

    await user.click(screen.getByRole('button', { name: 'Unsaved changes (2)' }));
    const d = await waitFor(drawer);
    // alice: kept; bob: dog + unfollow queued (one decision change)
    expect(within(d).getByText('2 accounts · 3 changes')).toBeInTheDocument();
    expect(within(d).getByText('Added tag dog')).toBeInTheDocument();
    expect(within(d).getByText('Needs a decision → Unfollow queued')).toBeInTheDocument();
    expect(within(d).queryByText('Added tag home')).not.toBeInTheDocument();

    await user.click(within(d).getByRole('button', { name: 'Decisions' }));
    expect(within(d).queryByText('Added tag dog')).not.toBeInTheDocument();
    expect(within(d).getByText('Needs a decision → Kept')).toBeInTheDocument();
    expect(within(d).getByText('Needs a decision → Unfollow queued')).toBeInTheDocument();

    await user.click(within(d).getByRole('button', { name: 'Tags' }));
    await user.click(within(d).getByRole('button', { name: /^dog\s*\+1$/ }));
    expect(
      within(d)
        .getAllByRole('link')
        .map(link => link.textContent),
    ).toEqual(['@bob ↗']);

    await user.click(within(d).getByRole('button', { name: 'Save master' }));
    await waitFor(() => {
      expect(downloads).toHaveLength(1);
    });
    expect(await within(d).findByText(/No edits since your last save/)).toBeInTheDocument();
  });

  test("Reset changes in the drawer undoes what's listed", async () => {
    const { user } = await imported();
    await user.click(keepButton('bob'));
    await user.click(screen.getByRole('button', { name: 'Unsaved changes (1)' }));
    await user.click(within(await waitFor(drawer)).getByRole('button', { name: 'Reset changes' }));
    const confirmReset = within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Reset' });
    // A dialog opened over the drawer accepts clicks a moment after it appears; retry until it does.
    await waitFor(() => user.click(confirmReset));
    expect(await within(drawer()).findByText(/No edits since your last save/)).toBeInTheDocument();
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
  const sheet = await openAccount(user, 'bob');
  await user.click(within(sheet).getByRole('button', { name: '+ New tag' }));
  expect(unnamed()).toEqual([]); // account sheet: unavailable switch, note, new tag
});

describe('tags', () => {
  async function imported() {
    const t = await renderApp();
    await importFiles(t.user, exportFiles());
    await findRow('bob');
    return t;
  }
  /** The tag chips in an account's sheet (its buttons in the Tags group besides "+ New tag"). */
  async function sheetTags(user: UserEvent, username: string) {
    const sheet = await openAccount(user, username);
    const chips = within(within(sheet).getByRole('group', { name: `Tags for @${username}` }))
      .queryAllByRole('button')
      .filter(b => b.textContent !== '+ New tag')
      .map(b => `${b.getAttribute('aria-label') ?? ''}${b.getAttribute('aria-pressed') === 'true' ? ' ✓' : ''}`);
    await closeAccount(user, username);
    return chips;
  }

  test('+ New tag creates a tag on that account; it then shows in every sheet and reuses its case', async () => {
    const { user } = await imported();
    expect(await sheetTags(user, 'alice')).toEqual([]);
    await newTag(user, 'alice', 'Artist');
    expect(await sheetTags(user, 'alice')).toEqual(['Artist ✓']);
    expect(await sheetTags(user, 'bob')).toEqual(['Artist']);
    expect(within(row('alice')).getByText('#Artist')).toBeInTheDocument(); // the card shows its tags as text

    await newTag(user, 'bob', '  artist ');
    expect(await sheetTags(user, 'bob')).toEqual(['Artist ✓']);
  });

  test('Manage tags: rename, merge and delete, with counts', async () => {
    const { user } = await imported();
    let sheet = await openFilterSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Manage tags' }));
    expect(await screen.findByText(/No tags yet/)).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('dialog', { name: 'Manage tags' })).getByRole('button', { name: /close/i }),
    );
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Manage tags' })).not.toBeInTheDocument();
    });
    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await sheetClosed();

    await newTag(user, 'alice', 'dog');
    await newTag(user, 'bob', 'dog');
    await newTag(user, 'bob', 'illustration');
    sheet = await openFilterSheet(user);
    await user.click(within(sheet).getByRole('button', { name: 'Manage tags' }));
    const dialog = await screen.findByRole('dialog', { name: 'Manage tags' });
    expect(within(dialog).getByText('2 accounts')).toBeInTheDocument();

    // Rename: an empty name is refused, a new name applies to every account with the tag.
    const lineOf = (tag: string) => must(within(dialog).getByText(tag).parentElement);
    await user.click(within(lineOf('dog')).getByRole('button', { name: 'Rename' }));
    const field = within(dialog).getByRole('textbox', { name: 'New name for dog' });
    await user.clear(field);
    await user.keyboard('{Enter}');
    expect(within(dialog).getByText('A tag needs a name.')).toBeInTheDocument();
    await user.type(field, 'dogs{Enter}');
    expect(within(lineOf('dogs')).getByText('2 accounts')).toBeInTheDocument();

    // Rename onto an existing tag asks, then merges.
    await user.click(within(lineOf('illustration')).getByRole('button', { name: 'Rename' }));
    await user.type(
      within(dialog).getByRole('textbox', { name: 'New name for illustration' }),
      '{Control>}a{/Control}Dogs{Enter}',
    );
    const merge = await screen.findByRole('alertdialog', { name: 'Merge tags?' });
    await waitFor(() => user.click(within(merge).getByRole('button', { name: 'Merge' })));
    await waitFor(() => {
      expect(within(dialog).queryByText('illustration')).not.toBeInTheDocument();
    });

    // Delete asks with the count.
    await user.click(within(lineOf('dogs')).getByRole('button', { name: 'Delete' }));
    const confirmDelete = await screen.findByRole('alertdialog');
    expect(within(confirmDelete).getByText('It will be removed from 2 accounts.')).toBeInTheDocument();
    await waitFor(() => user.click(within(confirmDelete).getByRole('button', { name: 'Delete' })));
    expect(await within(dialog).findByText(/No tags yet/)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: /close/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Manage tags' })).not.toBeInTheDocument();
    });
    await user.click(within(sheet).getByRole('button', { name: 'Close' }));
    await sheetClosed();
    expect(row('alice')).not.toHaveTextContent('#');
    expect(row('bob')).not.toHaveTextContent('#');
  });
});

test('a renamed follower is suggested in Lost followers, and confirming moves its work', async () => {
  const exportOf = (followers: [string, number][]) => [
    new File([JSON.stringify(followingFile(['alice', 101], ['bob', 102]))], 'following.json', {
      type: 'application/json',
    }),
    new File([JSON.stringify(followersFile(...followers))], 'followers_1.json', { type: 'application/json' }),
  ];
  const tabButton = (name: RegExp) => screen.getByRole('button', { name });
  let clock = Date.parse('2026-10-27T12:00:00.000Z');
  const now = () => new Date((clock += 60_000)); // the next import comes after the save
  const first = await renderApp({ now });
  const { downloads } = first;
  let user = first.user;
  await importFiles(
    user,
    exportOf([
      ['alice', 201],
      ['carol', 203],
    ]),
  );
  await findRow('alice');
  await applyFilters(user, 'Followers');
  await findRow('carol');
  await user.click(keepButton('carol'));
  await user.click(screen.getByRole('button', { name: 'Save master' }));
  await waitFor(() => {
    expect(downloads).toHaveLength(1);
  });

  await user.click(screen.getByRole('button', { name: 'Import files' }));
  const master = new File([must(downloads[0]).text], 'unfollowism_master.json', { type: 'application/json' });
  await importFiles(user, [
    master,
    ...exportOf([
      ['alice', 201],
      ['carol_2', 203],
    ]),
  ]);
  expect(await findRow('carol_2')).toBeInTheDocument();
  expect(screen.queryByText(/Looks renamed/)).not.toBeInTheDocument(); // only in Lost followers

  // A reload keeps the suggestion, like any unsaved edit.
  await waitFor(async () => {
    expect((await first.tab.load())?.base).toMatchObject({
      accounts: { carol: { renameSuggestion: { to: 'carol_2' } } },
    });
  });
  first.unmount();
  user = (await renderApp({ tab: first.tab, now })).user;

  await user.click(await screen.findByRole('button', { name: /^Lost followers \(1\)$/ }));
  const card = await findRow('carol');
  expect(within(card).getByText(/Looks renamed to/)).toBeInTheDocument();
  await user.click(within(card).getByRole('button', { name: 'Move to @carol_2' }));
  await waitFor(() => {
    expect(queryRow('carol')).not.toBeInTheDocument();
  });
  expect(tabButton(/^Lost followers \(0\)$/)).toBeInTheDocument();

  await user.click(tabButton(/^Review$/));
  await applyFilters(user, 'Followers'); // filters start fresh after the reload
  await findRow('carol_2');
  expect(isKept('carol_2')).toBe(true);
});
