import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', '.codex-backup', 'src/generated']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // Dataverse rows are read as untyped records throughout the app; flag new uses instead of failing the build.
      '@typescript-eslint/no-explicit-any': 'warn',
      // Data-loading effects ("load when the business unit changes") set state by design.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
  {
    // The entry file only mounts the app; Fast Refresh export rules don't apply to it.
    files: ['src/main.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
])
