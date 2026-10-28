import { describe, expect, it } from 'vitest';
import { rowsToCSV } from '../spreadsheetExport';
import {
  buildResultRows,
  difficultyRows,
  needsAttemptRead,
  resultCounts,
  resultCsvColumns,
  resultsFileName,
  scoreStats,
  type AttemptForRow,
  type GradeForRow,
} from '../examResultsRows';
import type { ExamQuestion } from '@/types/exams';

// The staff results table and its figures (EXAMS_FEATURE_SPEC.md §4.7, §6.6, §9).

const NOW = Date.UTC(2026, 9, 22, 15, 0, 0);
const MIN = 60_000;
const roster = [
  { uid: 's10', name: 'Student 10' },
  { uid: 's2', name: 'Student 2' },
  { uid: 's1', name: 'Student 1' },
  { uid: 's3', name: 'Student 3' },
];
const grade = (over: Partial<GradeForRow> = {}): GradeForRow => ({
  studentId: 's1',
  studentName: 'Student 1',
  score: 8,
  maxScore: 10,
  method: 'auto',
  gradedByName: 'Ms Lee',
  keyRevision: 1,
  releaseAtMs: null,
  resultSynced: false,
  tabSwitches: 2,
  submittedAtMs: NOW - 30 * MIN,
  submitReason: 'student',
  ...over,
});
const attempt = (over: Partial<AttemptForRow> = {}): AttemptForRow => ({
  studentId: 's2',
  studentName: 'Student 2',
  status: 'submitted',
  tabSwitches: 0,
  extraMinutes: 0,
  ...over,
});
const build = (grades: GradeForRow[], attempts: AttemptForRow[] | null = null, accommodations: Record<string, number> = {}, keyRevision = 1) =>
  buildResultRows({ roster, grades, attempts, accommodations, maxScore: 10, keyRevision, nowMs: NOW });
const byId = (rows: ReturnType<typeof build>, id: string) => rows.find((r) => r.studentId === id)!;

describe('buildResultRows', () => {
  it('lists the class in natural name order', () => {
    expect(build([]).map((r) => r.name)).toEqual(['Student 1', 'Student 2', 'Student 3', 'Student 10']);
  });

  it('marks a student with no grade and no attempt as Not started', () => {
    expect(byId(build([]), 's3')).toMatchObject({ status: 'Not started', hasGrade: false, score: null, percent: null, maxScore: 10 });
  });

  it('shows a graded student from the grade alone, with the score, percentage, tab count and who graded', () => {
    const row = byId(build([grade()]), 's1');
    expect(row).toMatchObject({
      status: 'Graded',
      score: 8,
      percent: 80,
      tabSwitches: 2,
      gradedByName: 'Ms Lee',
      method: 'auto',
      fromAttempt: true,
      released: false,
    });
  });

  it('says Released once the release time has passed, and Re-grade needed when the key has moved on', () => {
    expect(byId(build([grade({ releaseAtMs: NOW - MIN })]), 's1').status).toBe('Released');
    expect(byId(build([grade({ releaseAtMs: NOW + MIN })]), 's1').status).toBe('Graded');
    const stale = byId(build([grade({ keyRevision: 1 })], null, {}, 2), 's1');
    expect(stale).toMatchObject({ status: 'Re-grade needed', needsRegrade: true });
  });

  it('does not call a manual score stale when the key changes', () => {
    expect(byId(build([grade({ method: 'manual', keyRevision: 1 })], null, {}, 3), 's1').needsRegrade).toBe(false);
  });

  it('reads an ungraded student from the attempt when it was read', () => {
    const attempts = [attempt({ studentId: 's2' }), attempt({ studentId: 's3', status: 'in_progress' }), attempt({ studentId: 's10', studentName: 'Student 10', submitReason: 'expired' })];
    const rows = build([], attempts);
    expect(byId(rows, 's2').status).toBe('Submitted');
    expect(byId(rows, 's3').status).toBe('In progress');
    expect(byId(rows, 's10').status).toBe('Expired');
  });

  it('shows extra time from the accommodation, or the attempt', () => {
    const rows = build([], [attempt({ studentId: 's2', extraMinutes: 10 })], { s3: 15 });
    expect(byId(rows, 's2').extraMinutes).toBe(10);
    expect(byId(rows, 's3').extraMinutes).toBe(15);
    expect(byId(rows, 's1').extraMinutes).toBe(0);
  });

  it('keeps a graded student who is no longer in the class', () => {
    const rows = build([grade({ studentId: 'gone', studentName: 'Gone Student' })]);
    expect(rows.map((r) => r.name)).toContain('Gone Student');
  });

  it('shows a manual score for a student who never started, with its reason and comment', () => {
    const row = byId(
      build([grade({ studentId: 's3', studentName: 'Student 3', method: 'manual', submittedAtMs: undefined, submitReason: undefined, tabSwitches: undefined, manualReason: 'Paper copy', comment: 'Sat on paper' })]),
      's3',
    );
    expect(row).toMatchObject({ status: 'Graded', method: 'manual', fromAttempt: false, tabSwitches: null, manualReason: 'Paper copy', comment: 'Sat on paper' });
  });
});

describe('resultCounts and needsAttemptRead', () => {
  const rows = build(
    [grade({ releaseAtMs: NOW - MIN }), grade({ studentId: 's2', studentName: 'Student 2', keyRevision: 0 })],
    [attempt({ studentId: 's3', status: 'in_progress' })],
    {},
    1,
  );

  it('counts started, submitted, graded, released and out-of-date', () => {
    expect(resultCounts(rows, 3)).toEqual({ started: 3, submitted: 2, graded: 2, released: 1, needsRegrade: 1, ungraded: 0 });
  });

  it('counts the ungraded submitted and expired attempts', () => {
    const open = build([], [attempt(), attempt({ studentId: 's3', status: 'in_progress' }), attempt({ studentId: 's1', studentName: 'Student 1', submitReason: 'expired' })]);
    expect(resultCounts(open, 3).ungraded).toBe(2);
  });

  it('reads the attempts only when some are ungraded or a grade is out of date', () => {
    expect(needsAttemptRead({ attemptCount: 30, gradedFromAttempt: 30, needsRegrade: 0 })).toBe(false);
    expect(needsAttemptRead({ attemptCount: 30, gradedFromAttempt: 28, needsRegrade: 0 })).toBe(true);
    expect(needsAttemptRead({ attemptCount: 30, gradedFromAttempt: 30, needsRegrade: 2 })).toBe(true);
    expect(needsAttemptRead({ attemptCount: 0, gradedFromAttempt: 0, needsRegrade: 0 })).toBe(false);
  });
});

describe('scoreStats', () => {
  it('gives the average, lowest and highest of the graded scores', () => {
    const rows = build([grade({ score: 6 }), grade({ studentId: 's2', studentName: 'Student 2', score: 9 })]);
    expect(scoreStats(rows)).toEqual({ count: 2, average: 7.5, min: 6, max: 9 });
  });

  it('has no figures before anything is graded', () => {
    expect(scoreStats(build([]))).toEqual({ count: 0, average: null, min: null, max: null });
  });
});

describe('difficultyRows', () => {
  const q = (id: string, text: string): ExamQuestion => ({ id, text, kind: 'single', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], points: 1 });

  it('numbers the questions and gives the share who got each exactly right', () => {
    const rows = difficultyRows([q('q1', 'First'), q('q2', 'Second'), q('q3', 'Third')], { q1: { answered: 10, correct: 7 }, q2: { answered: 0, correct: 0 } });
    expect(rows).toEqual([
      { questionId: 'q1', number: 1, text: 'First', answered: 10, correct: 7, percent: 70 },
      { questionId: 'q2', number: 2, text: 'Second', answered: 0, correct: 0, percent: null },
      { questionId: 'q3', number: 3, text: 'Third', answered: 0, correct: 0, percent: null },
    ]);
  });

  it('cuts a long question to a short line', () => {
    const rows = difficultyRows([q('q1', 'x'.repeat(200))], {});
    expect(rows[0].text).toHaveLength(90);
    expect(rows[0].text.endsWith('…')).toBe(true);
  });
});

describe('the activity summary in a row', () => {
  const log = [
    { t: 30, k: 'hidden' as const, d: 95 },
    { t: 200, k: 'blur' as const, d: 4 },
  ];
  const summary = { leaves: 2, hiddenLeaves: 1, awaySeconds: 99, longestAwaySeconds: 95, acts: 0, review: false, timeline: log };
  const withExam = (grades: GradeForRow[], attempts: AttemptForRow[] | null, exam = { durationMinutes: 60, preset: 'supervised' as const }) =>
    buildResultRows({ roster, grades, attempts, accommodations: {}, maxScore: 10, keyRevision: 1, nowMs: NOW, exam });

  it('comes from the grade once there is one, so it survives Finalize', () => {
    const rows = withExam([grade({ integrity: { ...summary, review: true } })], null);
    expect(byId(rows, 's1').integrity).toEqual({ ...summary, review: true });
  });

  it('is worked out from the attempt for a student who has not been graded, with the Review mark from the exam', () => {
    const quick = attempt({ studentId: 's2', events: log, tabSwitches: 2 });
    expect(byId(withExam([], [quick]), 's2').integrity).toMatchObject({ leaves: 2, awaySeconds: 99, review: false });
    const manyLeaves = attempt({ studentId: 's2', events: Array.from({ length: 4 }, (_, i) => ({ t: i * 10, k: 'hidden' as const, d: 2 })), tabSwitches: 4 });
    expect(byId(withExam([], [manyLeaves], { durationMinutes: 10, preset: 'supervised' }), 's2').integrity?.review).toBe(true);
    expect(byId(withExam([], [manyLeaves], { durationMinutes: 180, preset: 'supervised' }), 's2').integrity?.review).toBe(false);
  });

  it('is worked out from the attempt for a grade made before the log, when the attempt was read', () => {
    const old = grade({ studentId: 's2' });
    const read = attempt({ studentId: 's2', events: log, tabSwitches: 2 });
    expect(byId(withExam([old], [read]), 's2').integrity?.leaves).toBe(2);
  });

  it('is null for a grade from before the log, a student who never started, and an attempt from before it, which keep the old count', () => {
    const rows = withExam([grade()], [attempt({ studentId: 's3', tabSwitches: 5 })]);
    expect(byId(rows, 's1')).toMatchObject({ integrity: null, tabSwitches: 2 });
    expect(byId(rows, 's3')).toMatchObject({ integrity: null, tabSwitches: 5 });
    expect(byId(rows, 's10').integrity).toBeNull(); // never started
  });

  it('gives the CSV the time away, the longest spell and Review as Yes or No, and nothing without a log', () => {
    const rows = withExam([grade({ integrity: { ...summary, review: true } })], [attempt({ studentId: 's2', events: log, tabSwitches: 2 })]);
    const csv = rowsToCSV(rows.filter((r) => r.studentId === 's1' || r.studentId === 's2' || r.studentId === 's3'), resultCsvColumns).split('\n');
    const header = csv[0].split(',');
    const col = (line: string, name: string) => line.split(',')[header.indexOf(`"${name}"`)];
    expect(col(csv[1], 'Time away (seconds)')).toBe('"99"');
    expect(col(csv[1], 'Longest time away (seconds)')).toBe('"95"');
    expect(col(csv[1], 'Review')).toBe('"Yes"');
    expect(col(csv[2], 'Review')).toBe('"No"');
    expect(col(csv[3], 'Review')).toBe('""');
  });
});

describe('the CSV', () => {
  it('has the table’s columns, keeps a formula-looking name as text, and leaves a missing score blank', () => {
    const rows = [
      ...build([grade({ studentName: '=cmd', score: 8 })], null).filter((r) => r.studentId === 's1' || r.studentId === 's3'),
    ];
    const csv = rowsToCSV(rows, resultCsvColumns).split('\n');
    expect(csv[0]).toBe(
      '"Student","Status","Score","Out of","Percentage","Tab switches","Time away (seconds)","Longest time away (seconds)","Review","Extra minutes","Graded by","Method"',
    );
    expect(csv[1]).toBe('"Student 1","Graded","8","10","80","2","","","","0","Ms Lee","auto"');
    expect(csv[2]).toBe('"Student 3","Not started","","10","","","","","","0","",""');
    const injected = build([grade({ studentId: 'x', studentName: '=cmd' })]);
    expect(rowsToCSV(injected.filter((r) => r.studentId === 'x'), resultCsvColumns)).toContain('"\'=cmd"');
  });

  it('names the file after the exam', () => {
    expect(resultsFileName('Unit 3 Quiz!')).toBe('Unit-3-Quiz-results.csv');
    expect(resultsFileName('  ')).toBe('exam-results.csv');
    expect(resultsFileName('x'.repeat(100)).length).toBeLessThanOrEqual(60 + '-results.csv'.length);
  });
});
