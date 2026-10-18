// The Import page as text, for the tests that pin what it does (they read source, like the other guard
// tests). The page is index.tsx plus the files it hands its configuration, Firestore reads, writes, account
// creation and step markup to, so a test asks for the whole of it here instead of naming one file. The
// per-target libraries (lib/importResults.ts and the like) are not part of it: they have their own tests.
// Line endings are made "\n".

const files = import.meta.glob(
  [
    '../../scenes/\\(dashboard\\)/import/index.tsx',
    '../../scenes/\\(dashboard\\)/import/*Step.tsx',
    '../../scenes/\\(dashboard\\)/import/importStyles.ts',
    '../../lib/importConfig.ts',
    '../../lib/importFetch.ts',
    '../../lib/importWrites.ts',
    '../../lib/importStudentsCommit.ts',
    '../../lib/importAttendanceRebuild.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

const norm = (s: string) => s.split('\r\n').join('\n');

/** The page and every file of it, joined (index.tsx first). */
export const importSource: string = Object.keys(files)
  .sort((a, b) => (a.endsWith('/index.tsx') ? -1 : b.endsWith('/index.tsx') ? 1 : a.localeCompare(b)))
  .map((k) => norm(files[k]))
  .join('\n');
