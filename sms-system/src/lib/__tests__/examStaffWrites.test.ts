import { describe, expect, it } from 'vitest';
import contentRaw from '../examContent.ts?raw';
import gradingRaw from '../examGrading.ts?raw';
import resultsHookRaw from '../../hooks/useExamResults.ts?raw';
import builderHookRaw from '../../hooks/useExamBuilder.ts?raw';

// Staff writes that must not overwrite a newer change by someone else (EXAMS_FEATURE_SPEC.md §6, §9): reads inside a
// transaction for one student or one save, and the grades read from the server before a class-wide run.

const norm = (s: string) => s.split('\r\n').join('\n');
const content = norm(contentRaw);
const grading = norm(gradingRaw);
const resultsHook = norm(resultsHookRaw);
const builderHook = norm(builderHookRaw);
const fn = (source: string, name: string) => {
  const from = source.indexOf(`export async function ${name}`);
  expect(from, name).toBeGreaterThan(-1);
  const next = source.indexOf('\nexport ', from + 10);
  return source.slice(from, next === -1 ? undefined : next);
};

describe('saving the questions and the key', () => {
  const save = fn(content, 'saveExamContent');

  it('is one transaction that reads before it writes and refuses when someone else saved first', () => {
    expect(save).toContain('await runTransaction(db, async (tx) => {');
    expect(save.indexOf('await tx.get(examRef)')).toBeLessThan(save.indexOf('tx.set('));
    expect(save).toContain('storedKeyRevision !== (p.exam.keyRevision ?? 1)');
    expect(save).toContain('storedRevision !== p.questionsRevision');
    expect(save.match(/throw new ExamConflictError\(/g)).toHaveLength(2);
    expect(save).not.toContain('writeBatch');
  });

  it('shows the conflict message to the teacher as it is', () => {
    expect(content).toContain("this.name = 'ExamConflictError'");
    expect(builderHook).toContain('err instanceof ExamConflictError ? err.message');
  });
});

describe('grading, scores and release', () => {
  it('reads the student’s grade inside the transaction for a score entered by hand and for a re-grade', () => {
    for (const name of ['saveManualGrade', 'regradeStudent']) {
      const body = fn(grading, name);
      expect(body, name).toContain('await runTransaction(db, async (tx) => {');
      expect(body, name).toContain('tx.get(gradeRef(c, p.studentId))');
      expect(body, name).not.toContain('data.grades');
    }
  });

  it('reads the grades from the server before a class-wide run, except on opening the screen, which has just read them', () => {
    expect(fn(grading, 'gradeAttempts')).toContain("opts.freshGrades === false ? data.grades : await loadGrades(");
    expect(fn(grading, 'syncResults')).toContain("opts.freshGrades === false ? data.grades : await loadGrades(");
    expect(fn(grading, 'releaseGrades')).toContain('await loadGrades(c.institutionId, c.exam.id)');
    expect(resultsHook).toContain('{ regrade: false, freshGrades: false }');
    expect(resultsHook).toContain('{ freshGrades: false }');
  });
});
