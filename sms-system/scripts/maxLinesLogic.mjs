// Measures the files on lint/maxLinesAllowList.json the way the max-lines lint rule counts them
// (blank and comment-only lines do not count), so src/lib/__tests__/maxLinesAllowList.test.ts can
// check that the list is neither stale nor loose. Pure Node; it only reads files.
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** [{ file, cap, exists, size }] for each entry of the allow-list; size is null for a file that is gone. */
export async function measureAllowList(allowList) {
  const files = Object.keys(allowList).filter((f) => existsSync(resolve(ROOT, f)));
  const eslint = new ESLint({
    cwd: ROOT,
    // a limit of 1 makes ESLint report every file's real size in its message
    overrideConfig: { rules: { 'max-lines': ['error', { max: 1, skipBlankLines: true, skipComments: true }] } },
  });
  const sizes = new Map();
  // lintFiles([]) lints the whole project, which takes about two minutes: with nothing to measure (the list is
  // empty, or every file on it is gone) skip it.
  const results = files.length > 0 ? await eslint.lintFiles(files) : [];
  for (const result of results) {
    const message = result.messages.find((m) => m.ruleId === 'max-lines');
    const size = Number(message?.message.match(/\((\d+)\)/)?.[1]);
    sizes.set(result.filePath.split('\\').join('/'), Number.isFinite(size) ? size : null);
  }
  return Object.entries(allowList).map(([file, cap]) => {
    const full = resolve(ROOT, file);
    return { file, cap, exists: existsSync(full), size: sizes.get(full.split('\\').join('/')) ?? null };
  });
}
