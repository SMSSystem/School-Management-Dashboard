import { readFileSync } from 'node:fs'
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

// Files that are already over the limit, with the size each may not exceed (lines that are not
// blank or comments). Lower a number when the file shrinks and delete the entry once it is under
// the limit; src/lib/__tests__/maxLinesAllowList.test.ts fails on an entry that is stale. A file that is not
// listed fails the lint at MAX_LINES.
const MAX_LINES = 600
const allowList: Record<string, number> = JSON.parse(
  readFileSync(new URL('./lint/maxLinesAllowList.json', import.meta.url), 'utf8'),
)
const maxLinesRule = (max: number) =>
  ['error', { max, skipBlankLines: true, skipComments: true }] as const
// A path in a glob: brackets and parentheses (a route folder like "[id]" or "(dashboard)") are literal here.
const literalGlob = (path: string) => path.replace(/[()[\]]/g, '\\$&')

export default tseslint.config(
  // internal/ is gitignored: local notes and one-off scripts, not part of what ships.
  { ignores: ['dist', 'internal'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { args: 'all', argsIgnorePattern: '^_' },
      ],
      'max-lines': maxLinesRule(MAX_LINES),
    },
  },
  ...Object.entries(allowList).map(([path, max]) => ({
    files: [literalGlob(path)],
    rules: { 'max-lines': maxLinesRule(max) },
  })),
)
