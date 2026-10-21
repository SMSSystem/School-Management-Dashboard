import { describe, expect, it } from 'vitest';
import { EXAM_SUBCOLLECTIONS } from '../examDeleteLogic';
import teardownRaw from '../../../scripts/teardown-bulk-institution.mjs?raw';
import countRaw from '../../../scripts/count-seed-institution.mjs?raw';
import seedRaw from '../../../scripts/seed-bulk-institution.mjs?raw';

// The owner scripts and an online exam's subcollections (EXAMS_FEATURE_SPEC.md §10): teardown must drain them and the
// count script must count them, from the same list as the app, so a leftover is never missed. These read the source.

const norm = (s: string) => s.split('\r\n').join('\n');
const teardown = norm(teardownRaw);
const count = norm(countRaw);
const seed = norm(seedRaw);
const listLine = `[${EXAM_SUBCOLLECTIONS.map((s) => `'${s}'`).join(', ')}]`;

describe('the bulk-seed teardown', () => {
  it('drains the five subcollections of an online exam, from the same list as the app', () => {
    expect(teardown).toContain(`const EXAM_SUBCOLLECTIONS = ${listLine};`);
  });

  it('reads no subcollections for a schedule-only exam, and deletes an online exam last', () => {
    expect(teardown).toContain('if (examDoc.data().online !== true) { plain.push(examDoc.ref); continue; }');
    expect(teardown).toContain('refs.push(examDoc.ref); // last');
    expect(teardown).toContain('exams: runTeardownExams,');
  });
});

describe('the seed counts', () => {
  it('counts the same five subcollections, within the exams path only (attempts also exists under submissions)', () => {
    expect(count).toContain(`const EXAM_SUBCOLLECTIONS = ${listLine};`);
    expect(count).toContain("`${base}/!/${name}/!`");
    expect(count).toContain("where('online', '==', true)");
  });

  it('checks them in verify mode too', () => {
    expect(count).toContain('countInstitutionTree(db, institutionId, problems, true)');
  });
});

describe('the seed', () => {
  it('still writes only schedule-only exams: no online field', () => {
    expect(seed).not.toMatch(/online:\s*true/);
    expect(seed).toContain('A schedule-only exam: no `online` field');
  });
});
