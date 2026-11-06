import eslintReact from '@eslint-react/eslint-plugin';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';
import boundaries from 'eslint-plugin-boundaries';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TS_FILES = ['**/*.{ts,tsx}'];
/** Feature-Sliced Design layers, top to bottom. */
const LAYERS = ['app', 'pages', 'widgets', 'features', 'entities', 'shared'];
/** Layers made of slices; another slice is entered only through its index.ts. */
const SLICED = ['pages', 'widgets', 'features', 'entities'];
/** What a layer may import: slices of lower layers through their index, and any file in shared. */
const layerPolicies = LAYERS.filter(layer => layer !== 'shared').flatMap(layer => {
  const lower = LAYERS.slice(LAYERS.indexOf(layer) + 1).filter(l => SLICED.includes(l));
  return [
    {
      from: { element: { types: [layer] } },
      allow: { to: { element: { types: lower }, file: { categories: ['sliceIndex'] } } },
    },
    { from: { element: { types: [layer] } }, allow: { to: { element: { types: ['shared'] } } } },
  ];
});

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    files: TS_FILES,
    extends: [js.configs.recommended, ...tseslint.configs.strictTypeChecked, reactRefresh.configs.vite],
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      '@stylistic': stylistic,
      'import-x': importX,
      '@eslint-react': eslintReact,
    },
    settings: {
      // `@/…` imports are our own files: they go in the "internal" group, after packages.
      'import-x/internal-regex': '^@/',
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],

      // Imports: packages, then our own files; alphabetical; a blank line between groups.
      'import-x/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      // prefer-inline: also catches a second import from a module when one of them has an inline `type` specifier.
      'import-x/no-duplicates': ['error', { 'prefer-inline': true }],

      // React
      '@eslint-react/no-missing-key': 'error',
      '@eslint-react/no-duplicate-key': 'error',
      '@eslint-react/dom-no-unsafe-target-blank': 'error',
      '@stylistic/jsx-self-closing-comp': 'error',

      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-else-return': ['error', { allowElseIf: false }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  // Feature-Sliced Design layers: a file imports only from layers below it; another slice only through its index.ts
  // (its public API), and slices of one layer don't import each other. Inside a slice, files import each other
  // directly, never through their own index.ts. Exception: any layer may type-import RootState / AppDispatch /
  // StoreDeps from app/store.
  {
    files: ['src/**/*.{ts,tsx}'],
    plugins: { boundaries },
    settings: {
      'boundaries/elements': [
        { type: 'app', pattern: 'src/app', partialMatch: false },
        { type: 'pages', pattern: 'src/pages/*', partialMatch: false },
        { type: 'widgets', pattern: 'src/widgets/*', partialMatch: false },
        { type: 'features', pattern: 'src/features/*', partialMatch: false },
        { type: 'entities', pattern: 'src/entities/*', partialMatch: false },
        { type: 'shared', pattern: 'src/shared', partialMatch: false },
      ],
      'boundaries/files': [
        { pattern: 'src/app/store/**', category: 'appStore' },
        { pattern: `src/{${SLICED.join(',')}}/*/index.ts`, category: 'sliceIndex' },
      ],
      // Tests may import from any layer (FSD maintainers agree).
      'boundaries/ignore': ['**/__tests__/**', '**/*.test.{ts,tsx}', 'src/perf/**', 'src/test/**'],
      // Resolves `@/…` imports; without it they'd count as packages and go unchecked.
      'import/resolver': { typescript: { alwaysTryTypes: true } },
    },
    rules: {
      'boundaries/dependencies': [
        'error',
        {
          default: 'disallow',
          checkInternals: true,
          policies: [
            ...layerPolicies,
            { allow: { dependency: { relationship: { to: 'internal' } } } },
            {
              disallow: {
                to: { file: { categories: ['sliceIndex'] } },
                dependency: { relationship: { to: 'internal' } },
              },
              message: 'Inside a slice, import the file directly, not through its own index.ts.',
            },
            {
              allow: {
                to: { element: { types: ['app'] }, file: { categories: ['appStore'] } },
                dependency: { kind: 'type' },
              },
            },
          ],
        },
      ],
    },
  },
  // Last: turns off every rule that could fight Prettier…
  prettier,
  // …then these two back on: with these options they don't.
  {
    files: TS_FILES,
    rules: {
      curly: ['error', 'all'],
      // Prettier wraps code at 120; this also holds comments and strings, which it can't wrap, to 120.
      '@stylistic/max-len': ['error', { code: 120, ignoreUrls: true }],
    },
  },
);
