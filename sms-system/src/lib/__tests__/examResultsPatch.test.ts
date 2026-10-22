import { describe, expect, it } from 'vitest';
import { applyStudentRecord, type GradeForRow } from '../examResultsRows';
import hookRaw from '../../hooks/useExamResults.ts?raw';
import dataRaw from '../examResultsData.ts?raw';

// Refreshing the results screen after a change to one student (EXAMS_FEATURE_SPEC.md §9): two reads, not the screen.

const norm = (s: string) => s.split('\r\n').join('\n');
const hook = norm(hookRaw);
const data = norm(dataRaw);

const grade = (studentId: string, score: number): GradeForRow => ({
  studentId,
  studentName: studentId,
  score,
  maxScore: 10,
  method: 'manual',
  gradedByName: 'T',
  keyRevision: 1,
  releaseAtMs: null,
  resultSynced: false,
});

describe('applyStudentRecord', () => {
  const base = { grades: [grade('a', 1), grade('b', 2)], accommodations: { a: 10 }, other: 'kept' };

  it('replaces one student’s grade and extra time and leaves everything else', () => {
    const next = applyStudentRecord(base, 'a', { grade: grade('a', 9), extraMinutes: 20 });
    expect(next.grades.find((g) => g.studentId === 'a')?.score).toBe(9);
    expect(next.grades.find((g) => g.studentId === 'b')?.score).toBe(2);
    expect(next.accommodations).toEqual({ a: 20 });
    expect(next.other).toBe('kept');
    expect(base.grades).toHaveLength(2); // the old data is not changed
    expect(base.accommodations).toEqual({ a: 10 });
  });

  it('adds a grade for a student who had none, and removes what no longer exists', () => {
    expect(applyStudentRecord(base, 'c', { grade: grade('c', 5), extraMinutes: null }).grades).toHaveLength(3);
    const gone = applyStudentRecord(base, 'a', { grade: null, extraMinutes: null });
    expect(gone.grades.map((g) => g.studentId)).toEqual(['b']);
    expect(gone.accommodations).toEqual({});
  });
});

describe('the results hook and the one-student read', () => {
  it('reads one student’s grade and extra time with two reads by id', () => {
    const at = data.indexOf('export async function loadStudentRecord');
    expect(at).toBeGreaterThan(-1);
    const body = data.slice(at, at + 900);
    expect(body.match(/getDoc\(/g)).toHaveLength(2);
    expect(body).not.toContain('getDocs(');
  });

  it('refreshes only that student after a score, a re-grade or extra time, and the whole screen after the class-wide actions', () => {
    expect(hook).toContain('const act = async (work: () => Promise<string>, only?: string)');
    expect(hook).toContain('}, p.studentId),');
    expect(hook.match(/\}, p\.studentId\),/g)).toHaveLength(3);
    expect(hook).toContain('applyStudentRecord(d, only, record)');
    // the class-wide actions keep the full reload
    expect(hook).toContain('act(async () => `Released ${plural(await releaseGrades(ctx!), "score")}.`)');
  });
});
