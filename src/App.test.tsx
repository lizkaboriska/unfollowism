import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { system } from "./theme.ts";
import { App } from "./App.tsx";

test("renders the app shell", () => {
  render(
    <ChakraProvider value={system}>
      <App />
    </ChakraProvider>,
  );
  expect(screen.getByRole("heading", { name: "Instagram Review" })).toBeInTheDocument();
});
