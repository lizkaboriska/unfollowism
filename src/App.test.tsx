import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { ChakraProvider } from "@chakra-ui/react";
import { Provider } from "react-redux";
import { App } from "./App.tsx";
import { followersFile, followingFile, must } from "./core/__tests__/helpers.ts";
import { memoryLastSaved } from "./io/lastSaved.ts";
import { openIndexedDbTabDatabase } from "./io/tabStore.ts";
import { IDBFactory, IDBKeyRange } from "fake-indexeddb";
import type { StoreDeps } from "./store/deps.ts";
import { makeStore } from "./store/index.ts";
import { system } from "./theme.ts";
import { DialogProvider } from "./ui/dialogs.tsx";

function renderApp({
  tab = openIndexedDbTabDatabase(new IDBFactory(), IDBKeyRange).forTab("tab-1"),
  lastSaved = memoryLastSaved(),
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

const row = (username: string) => must(screen.getByText(`@${username}`).closest("div")?.parentElement, `${username}'s row`);

test("starts on the import screen", () => {
  renderApp();
  expect(screen.getByRole("heading", { name: "Instagram Review" })).toBeInTheDocument();
  expect(screen.getByText("Drop your Instagram export here")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Choose files" })).toBeEnabled();
  expect(importButton()).toBeDisabled();
  expect(screen.getByRole("button", { name: "Save master" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Reset changes" })).toBeDisabled();
  expect(screen.queryByRole("button", { name: "Import files" })).not.toBeInTheDocument();
});

test("the ? button explains how to get the export", async () => {
  const { user } = renderApp();
  await user.click(screen.getByRole("button", { name: "How to get your Instagram export" }));
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).getByText("JSON")).toBeInTheDocument();
});

test("import → review → save works end to end", async () => {
  const { downloads, user } = renderApp();
  await user.upload(screen.getByTestId("file-input"), exportFiles());
  expect(await screen.findByText("Following ✓ · Followers ✓ (1 file) · Master: none — a new one will be started")).toBeInTheDocument();
  await user.click(importButton());

  expect(await screen.findByText(/Started a new master/)).toBeInTheDocument();
  expect(screen.queryByText("Drop your Instagram export here")).not.toBeInTheDocument();
  expect(screen.getByText("Following 2")).toBeInTheDocument();
  expect(screen.getByText("Mutual 1")).toBeInTheDocument();
  expect(screen.getByText("@alice")).toBeInTheDocument();
  expect(screen.queryByText("@carol")).not.toBeInTheDocument(); // only "I follow" is listed

  await user.click(within(row("bob")).getByText("Reviewed"));
  await user.click(screen.getByRole("button", { name: "Save master" }));
  await waitFor(() => { expect(downloads).toHaveLength(1); });
  const saved = JSON.parse(downloads[0]?.text ?? "{}") as { accounts: Record<string, { review: { reviewed: boolean } }> };
  expect(saved.accounts.bob?.review.reviewed).toBe(true);
  expect(screen.getByText("Saved")).toBeInTheDocument();
});

test("a missing Followers file is shown and Import stays disabled", async () => {
  const { user } = renderApp();
  await user.upload(screen.getByTestId("file-input"), [followingJson()]);
  expect(await screen.findByText(/^Following ✓ · Followers ✗/)).toBeInTheDocument();
  expect(screen.getByText(/followers_1\.json .* is missing/)).toBeInTheDocument();
  expect(importButton()).toBeDisabled();
});

const masterJson = (savedAt: string, name = "instagram_master_tracker.json") =>
  new File([JSON.stringify({ version: 1, lastSavedAt: savedAt, lastImportAt: savedAt, tagOptions: [], accounts: {} })], name, { type: "application/json" });

test("files chosen one after another add up, e.g. a master from another folder", async () => {
  const { user } = renderApp();
  await user.upload(screen.getByTestId("file-input"), exportFiles());
  expect(await screen.findByText(/Master: none/)).toBeInTheDocument();

  await user.upload(screen.getByTestId("file-input"), [masterJson("2026-10-01T00:00:00.000Z")]);
  expect(await screen.findByText(/^Following ✓ · Followers ✓ \(1 file\) · Master: instagram_master_tracker\.json \(saved/)).toBeInTheDocument();
  expect(screen.getByText("following.json")).toBeInTheDocument();
  expect(screen.getByText("followers_1.json")).toBeInTheDocument();
  expect(importButton()).toBeEnabled();
});

test("choosing the same file twice keeps one entry; × removes a file", async () => {
  const { user } = renderApp();
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
  const { user } = renderApp();
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
  const { user } = renderApp();
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
  const { user } = renderApp({ lastSaved: savedBefore() });
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
  expect(await screen.findByText("@bob")).toBeInTheDocument();
});

test("an older master is warned about as soon as it is added", async () => {
  const { user } = renderApp({ lastSaved: savedBefore() });
  await user.upload(screen.getByTestId("file-input"), [...exportFiles(), masterJson("2026-10-01T00:00:00.000Z")]);
  expect(await screen.findByText(/The chosen master is older than the one you saved from this browser/)).toBeInTheDocument();
  expect(importButton()).toBeEnabled();
});

test("Import files can be cancelled", async () => {
  const { user } = renderApp();
  await importFiles(user, exportFiles());
  await user.click(await screen.findByRole("button", { name: "Import files" }));
  expect(screen.getByText("Drop your Instagram export here")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Cancel" }));
  expect(screen.getByText("@bob")).toBeInTheDocument();
});

test("importing over unsaved work asks first", async () => {
  const { user } = renderApp();
  await importFiles(user, exportFiles());
  await user.click(within(row("bob")).getByText("Reviewed"));

  await user.click(screen.getByRole("button", { name: "Import files" }));
  await importFiles(user, exportFiles());
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Discard unsaved changes?")).toBeInTheDocument();
  await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
  await waitFor(() => { expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(); });
  expect(screen.getByText("Drop your Instagram export here")).toBeInTheDocument(); // nothing imported

  await user.click(importButton());
  await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Import anyway" }));
  await waitFor(() => { expect(within(row("bob")).getByRole("checkbox")).not.toBeChecked(); });
});

test("a reload silently continues where the tab left off", async () => {
  const first = renderApp();
  await importFiles(first.user, exportFiles());
  await first.user.click(within(await waitFor(() => row("bob"))).getByText("Reviewed"));
  await new Promise(resolve => setTimeout(resolve, 20)); // let the storage write finish
  first.unmount();

  renderApp({ tab: first.tab }); // same tab storage, fresh page
  expect(await screen.findByText("@bob")).toBeInTheDocument();
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  expect(within(row("bob")).getByRole("checkbox")).toBeChecked();
});

test("Reset changes asks first, then undoes unsaved work", async () => {
  const { user } = renderApp();
  await importFiles(user, exportFiles());
  await screen.findByText("@bob");
  const reset = screen.getByRole("button", { name: "Reset changes" });
  expect(reset).toBeDisabled();

  const bobCheckbox = () => within(row("bob")).getByRole("checkbox");
  await user.click(within(row("bob")).getByText("Reviewed"));
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
