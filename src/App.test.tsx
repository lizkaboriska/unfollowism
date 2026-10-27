import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ChakraProvider } from "@chakra-ui/react";
import { Provider } from "react-redux";
import { App } from "./App.tsx";
import { followersFile, followingFile } from "./core/__tests__/helpers.ts";
import { createMemorySessionStore } from "./io/sessionStore.ts";
import type { StoreDeps } from "./store/deps.ts";
import { makeStore } from "./store/index.ts";
import { system } from "./theme.ts";

function renderApp() {
  const downloads: { filename: string; text: string }[] = [];
  const deps: StoreDeps = {
    now: () => new Date("2026-10-27T12:00:00.000Z"),
    download: (filename, text) => { downloads.push({ filename, text }); },
    sessionStore: createMemorySessionStore(),
  };
  const store = makeStore(deps);
  render(
    <ChakraProvider value={system}>
      <Provider store={store}>
        <App deps={deps} />
      </Provider>
    </ChakraProvider>,
  );
  return { downloads, user: userEvent.setup() };
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
