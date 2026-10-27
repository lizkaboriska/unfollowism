import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

function renderApp(tab = openIndexedDbTabDatabase(new IDBFactory(), IDBKeyRange).forTab("tab-1")) {
  const downloads: { filename: string; text: string }[] = [];
  const deps: StoreDeps = {
    now: () => new Date("2026-10-27T12:00:00.000Z"),
    download: (filename, text) => { downloads.push({ filename, text }); },
    tab,
    lastSaved: memoryLastSaved(),
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

const exportFiles = () => [
  new File([JSON.stringify(followingFile(["alice"], ["bob"]))], "following.json", { type: "application/json" }),
  new File([JSON.stringify(followersFile(["alice"], ["carol"]))], "followers_1.json", { type: "application/json" }),
];

test("renders the start screen", () => {
  renderApp();
  expect(screen.getByRole("heading", { name: "Instagram Review" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Import files" })).toBeEnabled();
  expect(screen.getByRole("button", { name: "Save master" })).toBeDisabled();
});

test("import → review → save works end to end", async () => {
  const { downloads, user } = renderApp();
  await user.upload(screen.getByTestId("file-input"), exportFiles());

  expect(await screen.findByText(/Started a new master/)).toBeInTheDocument();
  expect(screen.getByText("Following 2")).toBeInTheDocument();
  expect(screen.getByText("Mutual 1")).toBeInTheDocument();
  expect(screen.getByText("@alice")).toBeInTheDocument();
  expect(screen.getByText("@bob")).toBeInTheDocument();
  expect(screen.queryByText("@carol")).not.toBeInTheDocument(); // only "I follow" is listed

  const bobRow = screen.getByText("@bob").closest("div")?.parentElement;
  if (!bobRow) throw new Error("row not found");
  await user.click(within(bobRow).getByText("Reviewed"));

  await user.click(screen.getByRole("button", { name: "Save master" }));
  await waitFor(() => { expect(downloads).toHaveLength(1); });
  const saved = JSON.parse(downloads[0]?.text ?? "{}") as { accounts: Record<string, { review: { reviewed: boolean } }> };
  expect(saved.accounts.bob?.review.reviewed).toBe(true);
  expect(screen.getByText("Saved")).toBeInTheDocument();
});

test("a broken selection shows a readable error", async () => {
  const { user } = renderApp();
  await user.upload(screen.getByTestId("file-input"), [new File(["[]"], "liked_posts.json", { type: "application/json" })]);
  expect(await screen.findByText(/No Instagram followers\/following files found/)).toBeInTheDocument();
});

test("a reload silently continues where the tab left off", async () => {
  const first = renderApp();
  await first.user.upload(screen.getByTestId("file-input"), exportFiles());
  const bobRow = (await screen.findByText("@bob")).closest("div")?.parentElement;
  if (!bobRow) throw new Error("row not found");
  await first.user.click(within(bobRow).getByText("Reviewed"));
  await new Promise(resolve => setTimeout(resolve, 20)); // let the storage write finish
  first.unmount();

  renderApp(first.tab); // same tab storage, fresh page
  expect(await screen.findByText("@bob")).toBeInTheDocument();
  expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
  const restoredRow = screen.getByText("@bob").closest("div")?.parentElement;
  if (!restoredRow) throw new Error("row not found");
  expect(within(restoredRow).getByRole("checkbox")).toBeChecked();
});

test("Reset changes asks first, then undoes unsaved work", async () => {
  const { user } = renderApp();
  await user.upload(screen.getByTestId("file-input"), exportFiles());
  const reset = await screen.findByRole("button", { name: "Reset changes" });
  expect(reset).toBeDisabled();

  const bobRow = () => must(screen.getByText("@bob").closest("div")?.parentElement, "bob's row");
  const bobCheckbox = () => within(bobRow()).getByRole("checkbox");
  await user.click(within(bobRow()).getByText("Reviewed"));
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
