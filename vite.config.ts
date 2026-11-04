/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/** Matches files of these npm packages (or package scopes); `[\\/]` also matches Windows paths. */
function libraries(names: readonly string[]): RegExp {
  return new RegExp(`node_modules[\\\\/](${names.join('|')})[\\\\/]`);
}

export default defineConfig({
  plugins: [react()],
  // Absolute asset paths: the app is served from the site root, and pages like /todo/unfollow must still find them.
  base: '/',
  // `@/…` imports point at src/ (paths in tsconfig.app.json).
  resolve: { tsconfigPaths: true },
  build: {
    rolldownOptions: {
      output: {
        // Libraries in files of their own: they keep their names across our releases, so phones keep them cached
        // (public/_headers) and only download our code again. zip.js has no group: a group would load it at start.
        codeSplitting: {
          groups: [
            { name: 'react', test: libraries(['react', 'react-dom', 'scheduler']) },
            {
              name: 'chakra',
              test: libraries([
                '@chakra-ui',
                '@ark-ui',
                '@zag-js',
                '@floating-ui',
                '@emotion',
                '@pandacss',
                '@internationalized',
                'stylis',
                'hoist-non-react-statics',
              ]),
            },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['src/**/*.perf.test.ts'], // run with `npm run test:perf`
  },
});
