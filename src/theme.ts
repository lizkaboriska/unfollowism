import { createSystem, defaultConfig, defineConfig } from "@chakra-ui/react";

// Light-only theme: cream background, plum text. Other colors come from Chakra's built-in palettes.
export const system = createSystem(
  defaultConfig,
  defineConfig({
    globalCss: {
      body: { bg: "#fff8f3", color: "#2c2440" },
    },
  }),
);
