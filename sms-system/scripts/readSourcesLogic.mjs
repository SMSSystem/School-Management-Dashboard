// Reads source files as text for the guard tests that look for a literal anywhere in the app or the
// scripts (src/lib/__tests__/roleDefaultPasswords.test.ts). Pure Node and read-only; kept here because
// the test project has no Node types, like the other *Logic.mjs helpers.
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));

/** Map of file path -> text for every .ts, .tsx, .mjs and .mts file under `dirs` (relative to sms-system/), skipping node_modules and logs. */
export function readSourceTexts(dirs) {
  const out = new Map();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'logs') walk(full);
      } else if (/\.(ts|tsx|mjs|mts)$/.test(entry.name)) {
        out.set(full.replaceAll('\\', '/'), readFileSync(full, 'utf8'));
      }
    }
  };
  for (const d of dirs) walk(resolve(ROOT, d));
  return out;
}
