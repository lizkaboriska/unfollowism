import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { ChakraProvider } from "@chakra-ui/react";
import { Provider } from "react-redux";
import { App } from "./App.tsx";
import { followersFile, followingFile, must } from "./core/__tests__/helpers.ts";
import { memoryLastSaved } from "./io/lastSaved.ts";
import { openIndexedDbTabDatabase, type TabStore } from "./io/tabStore.ts";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import type { StoreDeps } from "./store/deps.ts";
import { makeStore } from "./store/index.ts";
import { system } from "./theme.ts";
import { DialogProvider } from "./ui/dialogs.tsx";

async function renderApp({
  tab = openIndexedDbTabDatabase(new IDBFactory(), IDBKeyRange).forTab("tab-1"),
  lastSaved = memoryLastSaved(),
  waitForRestore = true,
} = {}) {
  const downloads: { filename: string; text: string }[] = [];
  const deps: StoreDeps = {
    now: () => new Date("2026-10-27T12:00:00.000Z"),
    download: (filename, text) => { downloads.push({ filename, text }); },
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
  if (waitForRestore) await waitFor(() => { expect(screen.queryByText("Loading your work…")).not.toBeInTheDocument(); });
  return { downloads, user: userEvent.setup(), unmount: view.unmount, tab };
}

const followingJson = () => new File([JSON.stringify(followingFile(["alice"], ["bob"]))], "following.json", { type: "application/json" });
const followersJson = () => new File([JSON.stringify(followersFile(["alice"], ["carol"]))], "followers_1.json", { type: "application/json" });
const exportFiles = () => [followingJson(), followersJson()];

const importButton = () => screen.getByRole("button", { name: "Import" });

/** Chooses the files and clicks Import, as a user would. */
async function importFiles(user: UserEvent, files: File[]) {
  await user.upload(screen.getByTestId("file-input"), files);
  await waitFor(() => { expect(importButton()).toBeEnabled(); });
  await user.click(importButton());
}

const row = (username: string) => screen.getByRole("article", { name: `@${username}` });
const findRow = (username: string) => screen.findByRole("article", { name: `@${username}` });
const queryRow = (username: string) => screen.queryByRole("article", { name: `@${username}` });
const reviewedBox = (username: string) => within(row(username)).getByRole("checkbox", { name: "Reviewed" });

test("starts on the import screen", async () => {
  await renderApp();
  expect(screen.getByRole("heading", { name: "Instagram Review" })).toBeInTheDocument();
  expect(screen.getByText("Drop your Instagram export here")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose files" })).toBeEnabled();
  expect(importButton()).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save master" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reset changes" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Import files" })).not.toBeInTheDocument();
});

test("the ? button explains how to get the export", async () => {
  const { user } = await renderApp();
  await user.click(screen.getByRole("button", { name: "How to get your Instagram export" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("JSON")).toBeInTheDocument();
});

test("import → review → save works end to end", async () => {
  const { downloads, user } = await renderApp();
  await user.upload(screen.getByTestId("file-input"), exportFiles());
  expect(await screen.findByText("Following ✓ · Followers ✓ (1 file) · Master: none — a new one will be started")).toBeInTheDocument();
  await user.click(importButton());

  expect(await screen.findByText(/Started a new master/)).toBeInTheDocument();
  expect(screen.queryByText("Drop your Instagram export here")).not.toBeInTheDocument();
  expect(screen.getByText("Following 2")).toBeInTheDocument();
  expect(screen.getByText("Mutual 1")).toBeInTheDocument();
  expect(row("alice")).toBeInTheDocument();
  expect(queryRow("carol")).not.toBeInTheDocument(); // the Review tab starts on "I follow"

  await user.click(reviewedBox("bob"));
  await user.click(screen.getByRole("button", { name: "Save master" }));
  await waitFor(() => { expect(downloads).toHaveLength(1); });
  const saved = JSON.parse(downloads[0]?.text ?? "{}") as { accounts: Record<string, { review: { reviewed: boolean } }> };
  expect(saved.accounts.bob?.review.reviewed).toBe(true);
  expect(screen.getByText("Saved")).toBeInTheDocument();
});

test("a missing Followers file is shown and Import stays disabled", async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId("file-input"), [followingJson()]);
  expect(await screen.findByText(/^Following ✓ · Followers ✗/)).toBeInTheDocument();
  expect(screen.getByText(/followers_1\.json .* is missing/)).toBeInTheDocument();
  expect(importButton()).toBeDisabled();
});

const masterJson = (savedAt: string, name = "instagram_master_tracker.json") =>
  new File([JSON.stringify({ version: 1, lastSavedAt: savedAt, lastImportAt: savedAt, tagOptions: [], accounts: {} })], name, { type: "application/json" });

test("files chosen one after another add up, e.g. a master from another folder", async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId("file-input"), exportFiles());
  expect(await screen.findByText(/Master: none/)).toBeInTheDocument();

  await user.upload(screen.getByTestId("file-input"), [masterJson("2026-10-01T00:00:00.000Z")]);
  expect(await screen.findByText(/^Following ✓ · Followers ✓ \(1 file\) · Master: instagram_master_tracker\.json \(saved/)).toBeInTheDocument();
  expect(screen.getByText("following.json")).toBeInTheDocument();
  expect(screen.getByText("followers_1.json")).toBeInTheDocument();
  expect(importButton()).toBeEnabled();
});

test("choosing the same file twice keeps one entry; × removes a file", async () => {
  const { user } = await renderApp();
  const files = exportFiles();
  await user.upload(screen.getByTestId("file-input"), files);
  await user.upload(screen.getByTestId("file-input"), [must(files[0])]);
  await waitFor(() => { expect(importButton()).toBeEnabled(); });
  expect(screen.getAllByText("following.json")).toHaveLength(1);

  await user.click(screen.getByRole("button", { name: "Remove followers_1.json" }));
  expect(await screen.findByText(/^Following ✓ · Followers ✗/)).toBeInTheDocument();
  expect(importButton()).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Clear all" }));
  expect(screen.queryByText("following.json")).not.toBeInTheDocument();
  expect(screen.queryByText(/^Following/)).not.toBeInTheDocument();
});

test("a conflict keeps the list so the extra file can be removed", async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId("file-input"), [...exportFiles(), masterJson("2026-10-01T00:00:00.000Z", "old.json")]);
  await user.upload(screen.getByTestId("file-input"), [masterJson("2026-10-20T00:00:00.000Z", "new.json")]);
  expect(await screen.findByText(/Found 2 master files/)).toBeInTheDocument();
  expect(importButton()).toBeDisabled();

  await user.click(screen.getByRole("button", { name: "Remove old.json" }));
  expect(await screen.findByText(/Master: new\.json/)).toBeInTheDocument();
  expect(screen.queryByText(/Found 2 master files/)).not.toBeInTheDocument();
  expect(importButton()).toBeEnabled();
});

test("a selection that can't be imported shows a readable error", async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId("file-input"), [
    new File(["<html>"], "following.html", { type: "text/html" }),
    new File(["<html>"], "followers_1.html", { type: "text/html" }),
  ]);
  expect(await screen.findByText(/This export is in HTML format/)).toBeInTheDocument();
  expect(importButton()).toBeDisabled();
});

const savedBefore = () => {
  const lastSaved = memoryLastSaved();
  lastSaved.set("2026-10-20T00:00:00.000Z");
  return lastSaved;
};

test("without a master, a previous save is only a hint while choosing; Import asks first", async () => {
  const { user } = await renderApp({ lastSaved: savedBefore() });
  await user.upload(screen.getByTestId("file-input"), exportFiles());
  expect(await screen.findByText(/Master: none — add the one you saved on .*, or a new one will be started/)).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument(); // no warning box while still choosing

  await user.click(importButton());
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Import without your master?")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => { expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); });
  expect(screen.getByText("Drop your Instagram export here")).toBeInTheDocument(); // nothing imported

  await user.click(importButton());
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Import anyway" }));
  expect(await findRow("bob")).toBeInTheDocument();
});

test("an older master is warned about as soon as it is added", async () => {
  const { user } = await renderApp({ lastSaved: savedBefore() });
  await user.upload(screen.getByTestId("file-input"), [...exportFiles(), masterJson("2026-10-01T00:00:00.000Z")]);
  expect(await screen.findByText(/The chosen master is older than the one you saved from this browser/)).toBeInTheDocument();
  expect(importButton()).toBeEnabled();
});

test("Import files can be cancelled", async () => {
  const { user } = await renderApp();
  await importFiles(user, exportFiles());
  await user.click(await screen.findByRole("button", { name: "Import files" }));
  expect(screen.getByText("Drop your Instagram export here")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(row("bob")).toBeInTheDocument();
});

test("importing over unsaved work asks first", async () => {
  const { user } = await renderApp();
  await importFiles(user, exportFiles());
  await findRow("bob");
  await user.click(reviewedBox("bob"));

  await user.click(screen.getByRole("button", { name: "Import files" }));
  await importFiles(user, exportFiles());
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Discard unsaved changes?")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => { expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); });
  expect(screen.getByText("Drop your Instagram export here")).toBeInTheDocument(); // nothing imported

  await user.click(importButton());
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Import anyway" }));
  await waitFor(() => { expect(reviewedBox("bob")).not.toBeChecked(); });
});

test("a reload silently continues where the tab left off", async () => {
  const first = await renderApp();
  await importFiles(first.user, exportFiles());
  await first.user.click(within(await findRow("bob")).getByRole("checkbox", { name: "Reviewed" }));
  await new Promise(resolve => setTimeout(resolve, 20)); // let the storage write finish
  first.unmount();

  await renderApp({ tab: first.tab }); // same tab storage, fresh page
  expect(await findRow("bob")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Unsaved changes (1)" })).toBeInTheDocument();
  expect(reviewedBox("bob")).toBeChecked();
});

test("a reload shows Loading your work… instead of flashing the import screen", async () => {
  const first = await renderApp();
  await importFiles(first.user, exportFiles());
  await findRow("bob");
  await new Promise(resolve => setTimeout(resolve, 20)); // let the storage write finish
  first.unmount();

  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const slowTab: TabStore = { ...first.tab, load: async () => { await gate; return first.tab.load(); } };
  await renderApp({ tab: slowTab, waitForRestore: false });
  expect(screen.getByText("Loading your work…")).toBeInTheDocument();
  expect(screen.queryByText("Drop your Instagram export here")).not.toBeInTheDocument();
  release();
  expect(await findRow("bob")).toBeInTheDocument();
});

test("Import shows that it's working", async () => {
  const { user } = await renderApp();
  await user.upload(screen.getByTestId("file-input"), exportFiles());
  await waitFor(() => { expect(importButton()).toBeEnabled(); });
  await user.click(importButton());
  expect(screen.getByText(/Importing… large accounts can take a few seconds/)).toBeInTheDocument();
  expect(await findRow("bob")).toBeInTheDocument();
});

test("Reset changes asks first, then undoes unsaved work", async () => {
  const { user } = await renderApp();
  await importFiles(user, exportFiles());
  await findRow("bob");
  const reset = screen.getByRole("button", { name: "Reset changes" });
  expect(reset).toBeDisabled();

  const bobCheckbox = () => reviewedBox("bob");
  await user.click(reviewedBox("bob"));
  expect(bobCheckbox()).toBeChecked();
  expect(reset).toBeEnabled();

  await user.click(reset);
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText(/Changes to 1 account since your last save/)).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => { expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); });
  expect(bobCheckbox()).toBeChecked();

  await user.click(reset);
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset" }));
  await waitFor(() => { expect(bobCheckbox()).not.toBeChecked(); });
  expect(reset).toBeDisabled();
});

describe("main view", () => {
  // exportFiles(): following alice + bob, followers alice + carol. Without a saved master everyone counts as new.
  async function imported() {
    const t = await renderApp();
    await importFiles(t.user, exportFiles());
    await findRow("bob");
    return t;
  }
  const tab = (name: RegExp) => screen.getByRole("button", { name });
  const select = (name: string) => screen.getByRole("combobox", { name });
  const shown = () => screen.queryAllByRole("article").map(card => card.getAttribute("aria-label"));

  test("tabs switch lists; empty tabs are disabled", async () => {
    const { user } = await imported();
    expect(shown()).toEqual(["@alice", "@bob"]);
    expect(tab(/^I unfollowed \(0\)$/)).toBeDisabled();
    expect(tab(/^To do \(0\)$/)).toBeDisabled();

    await user.click(tab(/^New followers \(2\)$/));
    expect(shown()).toEqual(["@alice", "@carol"]);
    expect(screen.getByText("2 accounts started following you since you started")).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Scope" })).not.toBeInTheDocument(); // scope is Review-only
  });

  test("search, status and tag narrow the list and are kept across tabs", async () => {
    const { user } = await imported();
    await user.type(screen.getByRole("textbox", { name: "Search username" }), "bo");
    expect(shown()).toEqual(["@bob"]);
    await user.click(tab(/^New follows/));
    expect(shown()).toEqual(["@bob"]);
    await user.clear(screen.getByRole("textbox", { name: "Search username" }));

    await user.click(within(row("alice")).getByRole("button", { name: "artist" }));
    await user.selectOptions(select("Tag"), "artist");
    expect(shown()).toEqual(["@alice"]);
    await user.selectOptions(select("Tag"), "Untagged");
    expect(shown()).toEqual(["@bob"]);
  });

  test("a ticked card stays until the list refreshes", async () => {
    const { user } = await imported();
    await user.selectOptions(select("Status"), "Needs review");
    await user.click(reviewedBox("bob"));
    expect(shown()).toEqual(["@alice", "@bob"]); // still there while you work
    await user.selectOptions(select("Status"), "All");
    await user.selectOptions(select("Status"), "Needs review");
    expect(shown()).toEqual(["@alice"]);
  });

  test("plans: offered only when the follow exists; To do → Done leaves the list on refresh", async () => {
    const { user } = await imported();
    await user.selectOptions(select("Scope"), "All current accounts");
    expect(within(row("bob")).queryByRole("checkbox", { name: "To remove" })).not.toBeInTheDocument(); // bob doesn't follow me
    expect(within(row("carol")).queryByRole("checkbox", { name: "To unfollow" })).not.toBeInTheDocument(); // I don't follow carol
    expect(within(row("alice")).getByRole("checkbox", { name: "To remove" })).toBeInTheDocument();

    await user.click(within(row("bob")).getByRole("checkbox", { name: "To unfollow" }));
    expect(reviewedBox("bob")).toBeChecked(); // planning counts as reviewing
    await user.selectOptions(select("Status"), "Needs review");
    await user.click(tab(/^To do \(1\)$/));
    expect(shown()).toEqual(["@bob"]); // Status doesn't apply in To do…
    expect(screen.queryByRole("combobox", { name: "Status" })).not.toBeInTheDocument(); // …so it's hidden there
    expect(screen.getByText("1 to unfollow")).toBeInTheDocument();

    await user.click(within(row("bob")).getByRole("checkbox", { name: "Done" }));
    expect(screen.getByText("0 to unfollow · 1 done, waiting for the next import")).toBeInTheDocument();
    expect(shown()).toEqual(["@bob"]); // stays until the list refreshes
    await user.click(tab(/^Review$/));
    expect(tab(/^To do \(0\)$/)).toBeDisabled();
  });

  test("tags and notes end up in the saved master", async () => {
    const { user, downloads } = await imported();
    await user.click(within(row("bob")).getByRole("button", { name: "dog" }));
    await user.type(within(row("bob")).getByRole("textbox", { name: "Note for @bob" }), "met at a show");
    await user.click(screen.getByRole("button", { name: "Save master" }));
    await waitFor(() => { expect(downloads).toHaveLength(1); });
    const saved = JSON.parse(must(downloads[0]).text) as { accounts: Record<string, { review: { tags: string[]; notes: string } }> };
    expect(saved.accounts.bob?.review).toMatchObject({ tags: ["dog"], notes: "met at a show" });
  });

  test("Reset scope asks with the count and is disabled with nothing to reset", async () => {
    const { user } = await imported();
    const reset = screen.getByRole("button", { name: "Reset scope" });
    expect(reset).toBeDisabled();
    await user.click(reviewedBox("alice"));
    await user.click(reviewedBox("bob"));
    await user.click(reset);
    const dialog = await screen.findByRole("alertdialog");
    expect(within(dialog).getByText(/Reset reviewed for 2 accounts matching I follow\?/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: "Reset" }));
    await waitFor(() => { expect(reviewedBox("bob")).not.toBeChecked(); });
    expect(select("Status")).toHaveValue("needsReview");
  });

  test("the Instagram link opens a side popup; modifier clicks are left to the browser", async () => {
    const { user } = await imported();
    const open = vi.spyOn(window, "open").mockReturnValue({ focus: () => undefined } as Window);
    const link = within(row("bob")).getByRole("link", { name: /@bob/ });
    expect(link).toHaveAttribute("href", "https://www.instagram.com/bob");
    await user.click(link);
    expect(open).toHaveBeenCalledWith("https://www.instagram.com/bob", "instagram-review-profile", expect.stringContaining("popup=yes"));

    open.mockClear();
    await user.keyboard("{Meta>}");
    await user.click(link);
    await user.keyboard("{/Meta}");
    expect(open).not.toHaveBeenCalled();
    open.mockRestore();
  });
});

describe("unsaved changes drawer", () => {
  async function imported() {
    const t = await renderApp();
    await importFiles(t.user, exportFiles());
    await findRow("bob");
    return t;
  }
  const drawer = () => screen.getByRole("dialog", { name: "Unsaved changes" });

  test("lists net changes per account, by category, and only what isn't saved", async () => {
    const { user, downloads } = await imported();
    await user.click(reviewedBox("alice"));
    await user.click(within(row("bob")).getByRole("button", { name: "dog" }));
    await user.click(within(row("bob")).getByRole("checkbox", { name: "To unfollow" }));
    await user.click(within(row("alice")).getByRole("button", { name: "home" }));
    await user.click(within(row("alice")).getByRole("button", { name: "home" })); // back again: no net change

    await user.click(screen.getByRole("button", { name: "Unsaved changes (2)" }));
    const d = await waitFor(drawer);
    expect(within(d).getByText("2 accounts · 4 changes")).toBeInTheDocument(); // alice ✓; bob ✓ + dog + to unfollow
    expect(within(d).getByText("Added tag dog")).toBeInTheDocument();
    expect(within(d).getByText("Marked to unfollow")).toBeInTheDocument();
    expect(within(d).queryByText("Added tag home")).not.toBeInTheDocument();

    await user.click(within(d).getByRole("button", { name: "Actions" }));
    expect(within(d).queryByText("Marked reviewed")).not.toBeInTheDocument();
    expect(within(d).getByText("Marked to unfollow")).toBeInTheDocument();

    await user.click(within(d).getByRole("button", { name: "Tags" }));
    await user.click(within(d).getByRole("button", { name: /^dog\s*\+1$/ }));
    expect(within(d).getAllByRole("link").map(link => link.textContent)).toEqual(["@bob ↗"]);

    await user.click(within(d).getByRole("button", { name: "Save master" }));
    await waitFor(() => { expect(downloads).toHaveLength(1); });
    expect(await within(d).findByText(/No edits since your last save/)).toBeInTheDocument();
  });

  test("Reset changes in the drawer undoes what's listed", async () => {
    const { user } = await imported();
    await user.click(reviewedBox("bob"));
    await user.click(screen.getByRole("button", { name: "Unsaved changes (1)" }));
    await user.click(within(await waitFor(drawer)).getByRole("button", { name: "Reset changes" }));
    const confirmReset = within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Reset" });
    // A dialog opened over the drawer accepts clicks a moment after it appears; retry until it does.
    await waitFor(() => user.click(confirmReset));
    expect(await within(drawer()).findByText(/No edits since your last save/)).toBeInTheDocument();
  });
});
