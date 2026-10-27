import { defineConfig } from "vitest/config";

/** `npm run test:perf`: the scale benchmark only (standalone, so nothing is inherited from vite.config.ts). */
export default defineConfig({
  test: { environment: "node", globals: true, include: ["src/**/*.perf.test.ts"], silent: false },
});
