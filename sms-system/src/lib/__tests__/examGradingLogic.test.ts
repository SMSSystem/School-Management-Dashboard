import { describe, expect, it } from 'vitest';
import {
  GRADE_COMMENT_MAX,
  MANUAL_REASON_MAX,
  autoGradeFields,
  gradeNowState,
  manualGradeFields,
  planGrading,
  releasePlan,
  resultFieldsFor,
  resultIdFor,
  resultsToSync,
  type AttemptForGrading,
  type ExistingGrade,
} from '../examGradingLogic';
import type { ExamQuestion } from '@/types/exams';

// Grading in a staff browser (EXAMS_FEATURE_SPEC.md §6).

const NOW = Date.UTC(2026, 9, 22, 15, 0, 0);
const MIN = 60_000;
const SERVER = { __serverTime: true };
const markers = { serverTime: SERVER, timestampOf: (ms: number) => ({ ts: ms }) };
const grader = { uid: 'teacher1', name: 'Ms Lee' };

const questions: ExamQuestion[] = [
  { id: 'q1', text: 'One', kind: 'single', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }], points: 1 },
  { id: 'q2', text: 'Two', kind: 'multiple', options: [{ id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' }], points: 2 },
];
const key = { q1: ['a'], q2: ['a', 'c'] };

const attempt = (over: Partial<AttemptForGrading> = {}): AttemptForGrading => ({
  studentId: 's1',
  studentName: 'Ann Lee',
  classId: 'c1',
  status: 'submitted',
  deadlineAtMs: NOW - 30 * MIN,
  answers: { q1: ['a'], q2: ['a', 'c'] },
  tabSwitches: 2,
  submittedAtMs: NOW - 40 * MIN,
  submitReason: 'student',
  ...over,
});
const grade = (over: Partial<ExistingGrade> = {}): ExistingGrade => ({
  studentId: 's1',
  method: 'auto',
  keyRevision: 1,
  releaseAtMs: null,
  resultSynced: false,
  ...over,
});
const exam = { releaseMode: 'manual' as const, keyRevision: 1, scoringMode: 'all_or_nothing' as const };

describe('the activity summary on a grade', () => {
  const log = [
    { t: 30, k: 'hidden' as const, d: 95 },
    { t: 200, k: 'blur' as const, d: 4 },
    { t: 260, k: 'copy' as const },
  ];
  const auto = (over: Partial<AttemptForGrading> = {}, e: Record<string, unknown> = {}) =>
    autoGradeFields({ institutionId: 'inst', attempt: attempt(over), questions, key, exam: { ...exam, ...e }, grader, nowMs: NOW, markers }).fields;

  it('is copied onto the grade from an attempt that has a log, with the figures and the timeline', () => {
    const f = auto({ events: log, tabSwitches: 2 });
    expect(f.integrity).toMatchObject({ leaves: 2, hiddenLeaves: 1, awaySeconds: 99, longestAwaySeconds: 95, acts: 1, review: false });
    expect((f.integrity as { timeline: unknown[] }).timeline).toEqual(log);
    expect('fastAnswers' in (f.integrity as object)).toBe(false);
    expect(f.tabSwitches).toBe(2);
  });

  it('is left out for an attempt from before the log, so such a grade is as it always was', () => {
    expect('integrity' in auto()).toBe(false);
    expect('integrity' in auto({ events: undefined })).toBe(false);
  });

  it('holds no undefined anywhere, because Firestore refuses it', () => {
    const text = JSON.stringify(auto({ events: log }), (_k, v) => (v === undefined ? '__undefined__' : v));
    expect(text).not.toContain('__undefined__');
  });

  it('asks for a Review from the length of the exam, its preset and the student’s extra time', () => {
    const many = Array.from({ length: 4 }, (_, i) => ({ t: i * 100, k: 'hidden' as const, d: 5 }));
    const review = (over: Partial<AttemptForGrading>, e: Record<string, unknown>) => (auto({ events: many, tabSwitches: 4, ...over }, e).integrity as { review: boolean }).review;
    expect(review({}, { durationMinutes: 10 })).toBe(true); // 4 leaves in a 10-minute quiz
    expect(review({}, { durationMinutes: 180 })).toBe(false); // 4 leaves in a 3-hour exam
    expect(review({}, { durationMinutes: 60, integrity: 'unsupervised' })).toBe(true); // stricter: 3 an hour
    expect(review({}, { durationMinutes: 60 })).toBe(false); // supervised: 6 an hour
    expect(review({ extraMinutes: 120 }, { durationMinutes: 60, integrity: 'unsupervised' })).toBe(false); // the extra time counts
  });

  it('is recomputed by a re-grade and kept by a manual score, which takes it from the attempt only the first time', () => {
    const summary = { leaves: 5, hiddenLeaves: 5, awaySeconds: 50, longestAwaySeconds: 20, acts: 0, review: true, timeline: [] };
    const manual = (existing: ExistingGrade | undefined, att?: Partial<AttemptForGrading>) =>
      manualGradeFields({
        institutionId: 'inst',
        student: { studentId: 's1', studentName: 'Ann Lee', classId: 'c1' },
        score: 2,
        maxScore: 3,
        reason: existing ? 'checked' : undefined,
        existing,
        attempt: att ? attempt(att) : undefined,
        exam,
        grader,
        nowMs: NOW,
        markers,
      });
    const kept = manual(grade({ tabSwitches: 5, integrity: summary }));
    expect(kept.ok && kept.fields.integrity).toEqual(summary);
    const first = manual(undefined, { events: log, tabSwitches: 2 });
    expect(first.ok && (first.fields.integrity as { leaves: number }).leaves).toBe(2);
    const none = manual(undefined);
    expect(none.ok && 'integrity' in none.fields).toBe(false);
  });
});

describe('planGrading', () => {
  const plan = (attempts: AttemptForGrading[], grades: ExistingGrade[] = [], keyRevision = 1) =>
    planGrading({ attempts, grades, keyRevision, nowMs: NOW });

  it('grades a submitted attempt that has no grade', () => {
    expect(plan([attempt()])).toEqual({ expire: [], grade: ['s1'], regrade: [] });
  });

  it('leaves an attempt that is still running within its deadline and grace', () => {
    expect(plan([attempt({ status: 'in_progress', deadlineAtMs: NOW + MIN })])).toEqual({ expire: [], grade: [], regrade: [] });
    expect(plan([attempt({ status: 'in_progress', deadlineAtMs: NOW - 30_000 })])).toEqual({ expire: [], grade: [], regrade: [] });
  });

  it('expires and grades an attempt left in progress long past its deadline', () => {
    expect(plan([attempt({ status: 'in_progress', deadlineAtMs: NOW - 5 * MIN })])).toEqual({ expire: ['s1'], grade: ['s1'], regrade: [] });
  });

  it('does not grade a student who already has a current grade', () => {
    expect(plan([attempt()], [grade()])).toEqual({ expire: [], grade: [], regrade: [] });
  });

  it('re-grades an automatic grade made on an older key, and never a score staff entered', () => {
    expect(plan([attempt()], [grade({ keyRevision: 1 })], 2)).toEqual({ expire: [], grade: ['s1'], regrade: ['s1'] });
    expect(plan([attempt()], [grade({ method: 'manual', keyRevision: 1 })], 2)).toEqual({ expire: [], grade: [], regrade: [] });
  });
});

describe('autoGradeFields', () => {
  const run = (over: Partial<Parameters<typeof autoGradeFields>[0]> = {}) =>
    autoGradeFields({ institutionId: 'inst', attempt: attempt(), questions, key, exam, grader, nowMs: NOW, markers, ...over });

  it('scores the attempt and records who graded it, with what key and when', () => {
    const out = run();
    expect(out.score).toBe(3);
    expect(out.maxScore).toBe(3);
    expect(out.fields).toMatchObject({
      institutionId: 'inst',
      studentId: 's1',
      studentName: 'Ann Lee',
      classId: 'c1',
      score: 3,
      maxScore: 3,
      method: 'auto',
      gradedBy: 'teacher1',
      gradedByName: 'Ms Lee',
      gradedAt: SERVER,
      keyRevision: 1,
    });
  });

  it('copies the tab count and the submit time and reason from the attempt', () => {
    const { fields } = run();
    expect(fields).toMatchObject({ tabSwitches: 2, submitReason: 'student', submittedAt: { ts: NOW - 40 * MIN } });
  });

  it('leaves out fields it has no value for', () => {
    const { fields } = run({ attempt: attempt({ submittedAtMs: undefined, submitReason: undefined, tabSwitches: undefined }) });
    expect(Object.keys(fields)).not.toContain('submittedAt');
    expect(Object.keys(fields)).not.toContain('tabSwitches');
    expect(Object.values(fields)).not.toContain(undefined);
  });

  it('uses the exam’s scoring mode', () => {
    const half = attempt({ answers: { q1: ['a'], q2: ['a'] } });
    expect(run({ attempt: half }).score).toBe(1);
    expect(run({ attempt: half, exam: { ...exam, scoringMode: 'partial' } }).score).toBe(2);
  });

  it('keeps a manual-release grade hidden until the Release button', () => {
    const out = run();
    expect(out.fields.releaseAt).toBeNull();
    expect(out.fields.resultSynced).toBe(false);
    expect(out.releasedNow).toBe(false);
  });

  it('releases an "as soon as graded" grade at the server time and marks its result as synced', () => {
    const out = run({ exam: { ...exam, releaseMode: 'auto' } });
    expect(out.fields.releaseAt).toBe(SERVER);
    expect(out.fields.resultSynced).toBe(true);
    expect(out.releasedNow).toBe(true);
  });

  it('gives a scheduled grade the exam’s release time, synced only if that time has passed', () => {
    const later = run({ exam: { ...exam, releaseMode: 'scheduled', releaseAtMs: NOW + 60 * MIN } });
    expect(later.fields.releaseAt).toEqual({ ts: NOW + 60 * MIN });
    expect(later.fields.resultSynced).toBe(false);
    const earlier = run({ exam: { ...exam, releaseMode: 'scheduled', releaseAtMs: NOW - MIN } });
    expect(earlier.fields.resultSynced).toBe(true);
    expect(run({ exam: { ...exam, releaseMode: 'scheduled', releaseAtMs: null } }).fields.releaseAt).toBeNull();
  });

  it('keeps the release time of a grade being re-graded, so a score is neither hidden nor re-timed', () => {
    const out = run({ existing: grade({ releaseAtMs: NOW - 10 * MIN, resultSynced: true }), exam: { ...exam, releaseMode: 'scheduled', releaseAtMs: NOW + 99 * MIN } });
    expect(out.fields.releaseAt).toEqual({ ts: NOW - 10 * MIN });
    expect(out.releasedNow).toBe(true);
  });

  it('writes the current key revision', () => {
    expect(run({ exam: { ...exam, keyRevision: 4 } }).fields.keyRevision).toBe(4);
  });
});

describe('manualGradeFields', () => {
  const student = { studentId: 's1', studentName: 'Ann Lee', classId: 'c1' };
  const manual = (over: Partial<Parameters<typeof manualGradeFields>[0]> = {}) =>
    manualGradeFields({ institutionId: 'inst', student, score: 7.5, maxScore: 10, exam, grader, nowMs: NOW, markers, ...over });

  it('writes a first score without a reason', () => {
    const out = manual();
    expect(out).toMatchObject({ ok: true, score: 7.5, maxScore: 10 });
    if (out.ok) {
      expect(out.fields).toMatchObject({ method: 'manual', score: 7.5, gradedBy: 'teacher1', releaseAt: null, resultSynced: false });
      expect(Object.keys(out.fields)).not.toContain('manualReason');
    }
  });

  it('needs a reason to change a score that already exists', () => {
    expect(manual({ existing: grade() })).toEqual({ ok: false, error: 'Give a reason for changing this score.' });
    expect(manual({ existing: grade(), reason: '   ' }).ok).toBe(false);
    const ok = manual({ existing: grade(), reason: 'Marked a question wrongly' });
    expect(ok.ok && ok.fields.manualReason).toBe('Marked a question wrongly');
  });

  it('keeps the tab count, the submit time and the release time already on the grade', () => {
    const out = manual({
      existing: grade({ releaseAtMs: NOW - MIN, tabSwitches: 5, submittedAtMs: NOW - 40 * MIN, submitReason: 'timeout', resultSynced: true }),
      reason: 'Fixed',
    });
    expect(out.ok && out.fields).toMatchObject({
      tabSwitches: 5,
      submitReason: 'timeout',
      submittedAt: { ts: NOW - 40 * MIN },
      releaseAt: { ts: NOW - MIN },
      resultSynced: true,
    });
  });

  it('takes the tab count and the submit time from the attempt when the grade has none, so the screen need not read the attempts again', () => {
    const attempt = { tabSwitches: 2, submittedAtMs: NOW - 30 * MIN, submitReason: 'student' as const };
    const first = manual({ attempt });
    expect(first.ok && first.fields).toMatchObject({ tabSwitches: 2, submitReason: 'student', submittedAt: { ts: NOW - 30 * MIN } });
    // a grade with nothing about an attempt on it (a score entered for someone who had not started, then they sat it)
    const later = manual({ existing: grade(), reason: 'Fixed', attempt });
    expect(later.ok && later.fields).toMatchObject({ tabSwitches: 2, submitReason: 'student' });
    // what the grade already says wins
    const kept = manual({ existing: grade({ tabSwitches: 5, submitReason: 'timeout' }), reason: 'Fixed', attempt });
    expect(kept.ok && kept.fields).toMatchObject({ tabSwitches: 5, submitReason: 'timeout' });
    // no attempt, no fields
    const none = manual();
    expect(none.ok && Object.keys(none.fields)).not.toContain('tabSwitches');
  });

  it('refuses a score below 0, above the maximum, or not a number, and rounds to two decimals', () => {
    for (const score of [-1, 10.01, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(manual({ score })).toEqual({ ok: false, error: 'The score must be from 0 to 10.' });
    }
    expect(manual({ score: 0 }).ok).toBe(true);
    expect(manual({ score: 10 }).ok).toBe(true);
    const rounded = manual({ score: 6.666 });
    expect(rounded.ok && rounded.score).toBe(6.67);
  });

  it('limits the length of the reason and the comment', () => {
    expect(manual({ existing: grade(), reason: 'x'.repeat(MANUAL_REASON_MAX + 1) }).ok).toBe(false);
    expect(manual({ existing: grade(), reason: 'x'.repeat(MANUAL_REASON_MAX) }).ok).toBe(true);
    expect(manual({ comment: 'x'.repeat(GRADE_COMMENT_MAX + 1) }).ok).toBe(false);
    const c = manual({ comment: '  Good work  ' });
    expect(c.ok && c.fields.comment).toBe('Good work');
  });

  it('is readable at once, with its result written in the same batch, when the exam releases as soon as graded', () => {
    const out = manual({ exam: { ...exam, releaseMode: 'auto' } });
    expect(out.ok && out.releasedNow).toBe(true);
    expect(out.ok && out.fields.resultSynced).toBe(true);
  });
});

describe('the results entry', () => {
  const examDoc = {
    id: 'exam1',
    institutionId: 'inst',
    termId: 't1',
    subjectId: 'sub1',
    classId: 'c1',
    className: '3A',
    departmentId: 'd1',
    title: 'Unit 3 Quiz',
    subjectName: 'Maths',
    date: '2026-10-22',
  };
  const build = (update: boolean, over: Partial<typeof examDoc> = {}) =>
    resultFieldsFor({ exam: { ...examDoc, ...over }, student: { studentId: 's1', studentName: 'Ann Lee' }, score: 8, maxScore: 10, grader, update, serverTime: SERVER });

  it('has a fixed id per exam and student', () => {
    expect(build(false).id).toBe('exam_exam1_s1');
    expect(resultIdFor('exam1', 's1')).toBe('exam_exam1_s1');
  });

  it('is an exam result with the back-link, the grader as teacher, and the exam’s class, subject and term', () => {
    expect(build(false).fields).toMatchObject({
      assessmentType: 'exam',
      assessmentName: 'Unit 3 Quiz',
      examId: 'exam1',
      teacherId: 'teacher1',
      teacherName: 'Ms Lee',
      classId: 'c1',
      className: '3A',
      termId: 't1',
      subjectId: 'sub1',
      departmentId: 'd1',
      institutionId: 'inst',
      studentId: 's1',
      score: 8,
      maxScore: 10,
      date: '2026-10-22',
      createdAt: SERVER,
    });
  });

  it('falls back to the subject for the name and to an empty department', () => {
    const fields = build(false, { title: '  ', departmentId: undefined }).fields;
    expect(fields.assessmentName).toBe('Maths');
    expect(fields.departmentId).toBe('');
  });

  it('changes only the score fields when it updates an entry, so the owner and creation time stay', () => {
    expect(build(true).fields).toEqual({ studentName: 'Ann Lee', score: 8, maxScore: 10 });
  });
});

describe('what is left to do', () => {
  const grades: ExistingGrade[] = [
    grade({ studentId: 'a', releaseAtMs: null }),
    grade({ studentId: 'b', releaseAtMs: NOW - MIN, resultSynced: false }),
    grade({ studentId: 'c', releaseAtMs: NOW - MIN, resultSynced: true }),
    grade({ studentId: 'd', releaseAtMs: NOW + MIN, resultSynced: false }),
  ];

  it('syncs released grades whose result is not written yet', () => {
    expect(resultsToSync(grades, NOW).map((g) => g.studentId)).toEqual(['b']);
  });

  it('releases the grades that have no release time', () => {
    expect(releasePlan(grades)).toEqual(['a']);
  });
});

describe('gradeNowState', () => {
  it('explains why Grade now is off', () => {
    expect(gradeNowState({ autoGrade: false, canAutoGrade: false, ungraded: 3, needsRegrade: 0 }).reason).toContain('Auto-Grade is off');
    expect(gradeNowState({ autoGrade: true, canAutoGrade: false, ungraded: 3, needsRegrade: 0 }).reason).toContain('key is not complete');
    expect(gradeNowState({ autoGrade: true, canAutoGrade: true, ungraded: 0, needsRegrade: 0 })).toEqual({
      enabled: false,
      reason: 'Everything submitted has been graded.',
    });
  });

  it('is on when something needs grading or re-grading', () => {
    expect(gradeNowState({ autoGrade: true, canAutoGrade: true, ungraded: 2, needsRegrade: 0 })).toEqual({ enabled: true, reason: null });
    expect(gradeNowState({ autoGrade: true, canAutoGrade: true, ungraded: 0, needsRegrade: 1 }).enabled).toBe(true);
  });
});
