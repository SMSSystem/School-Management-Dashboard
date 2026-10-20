// The Gradebook page as text, for the tests that pin what it does (they read source, like the other guard
// tests). The page is index.tsx plus the files it hands its logic, saving, state and markup to, so a test
// asks for the whole of it here instead of naming one file. The column modals are separate pages' worth of
// code with their own classification and are not part of it. Line endings are made "\n".

const files = import.meta.glob(
  [
    '../../scenes/\\(dashboard\\)/list/gradebook/index.tsx',
    '../../scenes/\\(dashboard\\)/list/gradebook/Gradebook*.tsx',
    '../../scenes/\\(dashboard\\)/list/gradebook/CommentPickerRow.tsx',
    '../../lib/gradebookLogic.ts',
    '../../lib/gradebookSave.ts',
    '../../hooks/useGradebook*.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const norm = (s: string) => s.split('\r\n').join('\n');

/** The page and every file of it, joined (index.tsx first). */
export const gradebookSource: string = Object.keys(files)
  .sort((a, b) => (a.endsWith('/index.tsx') ? -1 : b.endsWith('/index.tsx') ? 1 : a.localeCompare(b)))
  .map((k) => norm(files[k]))
  .join('\n');
