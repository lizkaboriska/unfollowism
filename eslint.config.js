import eslintReact from '@eslint-react/eslint-plugin';
import js from '@eslint/js';
import stylistic from '@stylistic/eslint-plugin';
import prettier from 'eslint-config-prettier/flat';
import importX from 'eslint-plugin-import-x';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const TS_FILES = ['**/*.{ts,tsx}'];

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
      'import-x/no-duplicates': 'error',

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
