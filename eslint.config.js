import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * Flat config. The rule set is deliberately narrow: everything enabled here is a bug
 * class this project has actually hit, or a correctness rule TypeScript alone cannot
 * catch (hook dependency order, undefined globals, unreachable code). Formatting is not
 * a concern here.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'release/**', 'node_modules/**', 'test-results/**', 'playwright-report/**', '.cache/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node, chrome: 'readonly' },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // TypeScript already enforces unused locals; the base rule double-reports and
      // disagrees about `_`-prefixed names.
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // `any` is allowed only with intent; this catches accidental ones.
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['error', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
      // The compiler-era rule flags the very common "load data, then set state" effect,
      // which is exactly what a page that reads IndexedDB must do. Kept off deliberately —
      // the async-storage accesses are covered by tests instead.
      'react-hooks/set-state-in-effect': 'off',
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['**/*.mjs', 'scripts/**/*.{js,mjs}', '*.config.{js,mjs,ts}'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // Tests, scripts and the service worker legitimately differ.
    files: ['src/tests/**', 'tests/**', 'scripts/**', '*.config.{ts,js}', 'playwright.config.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
);
