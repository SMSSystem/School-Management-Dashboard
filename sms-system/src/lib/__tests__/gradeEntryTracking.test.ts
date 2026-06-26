import { describe, it, expect } from 'vitest';
import {
  type SlotLite,
  type SubjectLite,
  type ResultLite,
  type FeedbackLite,
  BEHIND_THRESHOLD,
  buildAssignments,
  computeTracking,
  statusOf,
} from '../gradeEntryTracking';

// ── buildAssignments ────────────────────────────────────────────────────────────

describe('buildAssignments', () => {
  const slot = (teacherId: string, subjectId: string, classId: string): SlotLite => ({
    teacherId,
    teacherName: `T-${teacherId}`,
    subjectId,
    subjectName: `S-${subjectId}`,
    classId,
    className: `C-${classId}`,
  });

  it('uses timetable slots as precise, non-approximate assignments', () => {
    const a = buildAssignments([slot('t1', 'math', '9a')], []);
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ teacherId: 't1', subjectId: 'math', classId: '9a', approximate: false });
  });

  it('dedupes repeated slots (e.g. multiple days of the same class)', () => {
    const a = buildAssignments([slot('t1', 'math', '9a'), slot('t1', 'math', '9a')], []);
    expect(a).toHaveLength(1);
  });

  it('falls back to subjects (cartesian, approximate) only for subjects with no slot', () => {
    const subjects: SubjectLite[] = [
      { subjectId: 'eng', subjectName: 'English', teacherIds: ['t2', 't3'], teacherNames: ['Two', 'Three'], classIds: ['9a', '9b'], classNames: ['9A', '9B'] },
    ];
    const a = buildAssignments([slot('t1', 'math', '9a')], subjects);
    // 1 slot (math) + 2x2 cartesian (english) = 5
    expect(a).toHaveLength(5);
    const eng = a.filter((x) => x.subjectId === 'eng');
    expect(eng).toHaveLength(4);
    expect(eng.every((x) => x.approximate)).toBe(true);
  });

  it('does NOT add the subjects fallback when the subject already has a slot', () => {
    const subjects: SubjectLite[] = [
      { subjectId: 'math', subjectName: 'Math', teacherIds: ['t1', 't9'], teacherNames: ['One', 'Nine'], classIds: ['9a', '9b'], classNames: ['9A', '9B'] },
    ];
    const a = buildAssignments([slot('t1', 'math', '9a')], subjects);
    expect(a).toHaveLength(1); // slot wins; no phantom cartesian books for math
    expect(a[0].approximate).toBe(false);
  });
});

// ── statusOf ────────────────────────────────────────────────────────────────────

describe('statusOf', () => {
  it('classifies by columns and completeness', () => {
    expect(statusOf(0, 0)).toBe('not_started');
    expect(statusOf(3, 1)).toBe('complete');
    expect(statusOf(3, 0.5)).toBe('behind'); // < 0.8
    expect(statusOf(3, 0.9)).toBe('in_progress'); // >= 0.8, < 1
    expect(statusOf(3, BEHIND_THRESHOLD)).toBe('in_progress'); // boundary is inclusive of in_progress
  });
});

// ── computeTracking ─────────────────────────────────────────────────────────────

describe('computeTracking', () => {
  const assignments = buildAssignments(
    [
      { teacherId: 't1', teacherName: 'Alice', subjectId: 'math', subjectName: 'Math', classId: '9a', className: '9A' },
      { teacherId: 't2', teacherName: 'Bob', subjectId: 'eng', subjectName: 'English', classId: '9a', className: '9A' },
    ],
    [],
  );
  // Class 9A has 2 students: s1, s2
  const rosters = new Map([['9a', 2]]);

  it('computes columns, filled cells, completeness, and missing', () => {
    // math: 2 columns (Quiz, Test). Quiz has both students; Test has only s1.
    const results: ResultLite[] = [
      { subjectId: 'math', classId: '9a', studentId: 's1', assessmentName: 'Quiz' },
      { subjectId: 'math', classId: '9a', studentId: 's2', assessmentName: 'Quiz' },
      { subjectId: 'math', classId: '9a', studentId: 's1', assessmentName: 'Test' },
    ];
    const { markBooks } = computeTracking(assignments, results, rosters, []);
    const math = markBooks.find((m) => m.subjectId === 'math')!;
    expect(math.columns).toBe(2);
    expect(math.expectedStudents).toBe(2);
    expect(math.totalCells).toBe(4);
    expect(math.filledCells).toBe(3); // Quiz: s1,s2 + Test: s1
    expect(math.completeness).toBeCloseTo(0.75);
    expect(math.missing).toBe(1);
    expect(math.status).toBe('behind'); // 0.75 < 0.8
  });

  it('marks a mark book with no results as not_started', () => {
    const { markBooks } = computeTracking(assignments, [], rosters, []);
    const eng = markBooks.find((m) => m.subjectId === 'eng')!;
    expect(eng.columns).toBe(0);
    expect(eng.completeness).toBe(0);
    expect(eng.status).toBe('not_started');
  });

  it('tracks feedback completeness separately from scores', () => {
    const feedback: FeedbackLite[] = [{ subjectId: 'math', classId: '9a', studentId: 's1' }];
    const { markBooks } = computeTracking(assignments, [], rosters, feedback);
    const math = markBooks.find((m) => m.subjectId === 'math')!;
    expect(math.feedbackComplete).toBeCloseTo(0.5); // 1 of 2 students
  });

  it('rolls up teachers worst-first and flags those behind', () => {
    const results: ResultLite[] = [
      // Alice (math) fully complete: 1 column, both students
      { subjectId: 'math', classId: '9a', studentId: 's1', assessmentName: 'Quiz' },
      { subjectId: 'math', classId: '9a', studentId: 's2', assessmentName: 'Quiz' },
      // Bob (eng) not started → behind
    ];
    const { teachers, summary } = computeTracking(assignments, results, rosters, []);
    expect(teachers[0].teacherName).toBe('Bob'); // worst first (0% completeness)
    expect(teachers[0].behind).toBe(1);
    const alice = teachers.find((t) => t.teacherName === 'Alice')!;
    expect(alice.completeMarkBooks).toBe(1);
    expect(alice.avgCompleteness).toBe(1);
    expect(summary.teachersBehind).toBe(1);
    expect(summary.teacherCount).toBe(2);
  });

  it('handles an empty class roster without dividing by zero', () => {
    const results: ResultLite[] = [{ subjectId: 'math', classId: '9a', studentId: 's1', assessmentName: 'Quiz' }];
    const { markBooks } = computeTracking(assignments, results, new Map(), []);
    const math = markBooks.find((m) => m.subjectId === 'math')!;
    expect(math.expectedStudents).toBe(0);
    expect(math.totalCells).toBe(0);
    expect(math.completeness).toBe(0);
    expect(Number.isNaN(math.completeness)).toBe(false);
  });

  it('respects a custom behind threshold', () => {
    const results: ResultLite[] = [
      { subjectId: 'math', classId: '9a', studentId: 's1', assessmentName: 'Quiz' },
    ]; // 1 of 2 = 0.5
    const strict = computeTracking(assignments, results, rosters, [], { behindThreshold: 0.4 });
    expect(strict.markBooks.find((m) => m.subjectId === 'math')!.status).toBe('in_progress'); // 0.5 >= 0.4
  });
});
