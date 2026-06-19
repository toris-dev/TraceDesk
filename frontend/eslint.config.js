import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // TraceDesk loads Tauri-backed data in effects; React's compiler-oriented rule is too
      // restrictive for these app bootstrap and subscription flows.
      'react-hooks/set-state-in-effect': 'off',
      // Several modules intentionally export hooks, helpers, and components together.
      // TypeScript and build checks cover those contracts more reliably than fast-refresh lint.
      'react-refresh/only-export-components': 'off',
    },
  },
])
