import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

// Light-only theme loosely matching the legacy palette: cream background, plum text.
// Colors otherwise come from Chakra's built-in palettes (see PLAN.md › Theme).
export const system = createSystem(
  defaultConfig,
  defineConfig({
    globalCss: {
      body: { bg: "#fff8f3", color: "#2c2440" },
    },
  }),
);
