import { describe, expect, it } from 'vitest';
import allowList from '../../../lint/maxLinesAllowList.json';
import { measureAllowList } from '../../../scripts/maxLinesLogic.mjs';

// eslint.config.ts fails any TypeScript file over 600 lines (blank and comment-only lines do not
// count), except the files in lint/maxLinesAllowList.json, which may not grow past the number next
// to them. This keeps that list honest: no entry for a file that is gone or is now small enough,
// and no slack for a file that has shrunk, so the limit only ever moves down.

const LIMIT = 600;
const SLACK = 25; // a cap may sit a little above the real size; more than this should be lowered

describe('max-lines allow-list', () => {
  it('lists only files that exist, with a cap above the limit', () => {
    for (const [file, cap] of Object.entries(allowList)) {
      expect(cap, `${file}: a cap at or under ${LIMIT} means the entry is not needed`).toBeGreaterThan(LIMIT);
    }
  });

  it('has a cap close to each file’s real size', async () => {
    const rows = await measureAllowList(allowList);
    expect(rows.length, 'every entry should be measured').toBe(Object.keys(allowList).length);
    for (const { file, cap, exists, size } of rows) {
      expect(exists, `${file} no longer exists: remove it from the list`).toBe(true);
      expect(size, `${file}: could not be measured`).not.toBeNull();
      expect(size!, `${file} is ${size} lines: it is under the limit, remove its entry`).toBeGreaterThan(LIMIT);
      expect(size!, `${file} is ${size} lines, over its cap of ${cap}`).toBeLessThanOrEqual(cap);
      expect(cap - size!, `${file} is ${size} lines: lower its cap from ${cap}`).toBeLessThanOrEqual(SLACK);
    }
  }, 120_000);
});
