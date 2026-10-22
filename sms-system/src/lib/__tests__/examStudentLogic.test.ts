import { describe, expect, it } from 'vitest';
import { STATUS_READ_DAYS, examsForChildren, examsForStudent, scoreView, statusReads, studentExamState } from '../examStudentLogic';

// What a student or a parent sees of the exams (EXAMS_FEATURE_SPEC.md §4.5 and §4.6).

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 22, 14, 0, 0);
const ts = (ms: number) => ({ toMillis: () => ms });

const exam = (over: Record<string, unknown> = {}) => ({
  id: 'e1',
  classId: 'c1',
  subjectId: 's1',
  date: '2026-10-22',
  online: true,
  status: 'published',
  opensAt: ts(NOW - 60_000),
  closesAt: ts(NOW + 3_600_000),
  ...over,
});

describe('examsForStudent', () => {
  const exams = [
    exam({ id: 'home' }),
    exam({ id: 'other', classId: 'c9' }),
    exam({ id: 'extra-allowed', classId: 'c2', subjectId: 'sA' }),
    exam({ id: 'extra-not-taken', classId: 'c2', subjectId: 'sB' }),
    exam({ id: 'plain', online: false, status: undefined, opensAt: undefined, closesAt: undefined }),
  ];

  it('keeps the exams of the student’s classes, and in an extra class only the subjects they take', () => {
    const membership = { classId: 'c1', classIds: ['c1', 'c2'], classSubjects: { c2: ['sA'] } };
    expect(examsForStudent(exams, membership).map((e) => e.id)).toEqual(['home', 'extra-allowed', 'plain']);
  });

  it('keeps nothing for a student with no class, and nothing without a class on the exam', () => {
    expect(examsForStudent(exams, null)).toEqual([]);
    expect(examsForStudent(exams, {})).toEqual([]);
    expect(examsForStudent([{ id: 'x', date: '2026-10-22' }], { classId: 'c1' })).toEqual([]);
  });
});

describe('examsForChildren', () => {
  const kids = [
    { uid: 'k1', name: 'Zed', classId: 'c1', classIds: ['c1'] },
    { uid: 'k2', name: 'Amy', classId: 'c1', classIds: ['c1'] },
    { uid: 'k3', name: 'Bo', classId: 'c3', classIds: ['c3'] },
  ];

  it('gives one row per child per exam, soonest first, then by child name', () => {
    const exams = [exam({ id: 'late', date: '2026-10-30' }), exam({ id: 'soon', date: '2026-10-25' }), exam({ id: 'c3exam', classId: 'c3', date: '2026-10-25' })];
    const rows = examsForChildren(exams, kids).map((r) => `${r.exam.id}:${r.child.name}`);
    expect(rows).toEqual(['soon:Amy', 'c3exam:Bo', 'soon:Zed', 'late:Amy', 'late:Zed']);
  });

  it('is empty without children', () => {
    expect(examsForChildren([exam()], [])).toEqual([]);
  });
});

describe('statusReads', () => {
  it('reads the attempt and the score of an online exam that has opened and ended within 14 days', () => {
    expect(statusReads(exam(), NOW)).toEqual({ attempt: true, grade: true });
    const ended = exam({ opensAt: ts(NOW - 5 * DAY), closesAt: ts(NOW - 2 * DAY) });
    expect(statusReads(ended, NOW)).toEqual({ attempt: true, grade: true });
    const edge = exam({ opensAt: ts(NOW - 20 * DAY), closesAt: ts(NOW - STATUS_READ_DAYS * DAY) });
    expect(statusReads(edge, NOW)).toEqual({ attempt: true, grade: true });
  });

  it('reads nothing for an old exam, one that has not opened, a draft or a schedule-only exam', () => {
    const none = { attempt: false, grade: false };
    expect(statusReads(exam({ opensAt: ts(NOW - 30 * DAY), closesAt: ts(NOW - 20 * DAY) }), NOW)).toEqual(none);
    expect(statusReads(exam({ opensAt: ts(NOW + 1000), closesAt: ts(NOW + DAY) }), NOW)).toEqual(none);
    expect(statusReads(exam({ status: 'draft' }), NOW)).toEqual(none);
    expect(statusReads(exam({ online: false }), NOW)).toEqual(none);
    expect(statusReads(exam({ status: undefined }), NOW)).toEqual(none);
  });

  it('reads only the score of a finalized exam, whose attempts are gone', () => {
    expect(statusReads(exam({ status: 'finalized', closesAt: ts(NOW - DAY), opensAt: ts(NOW - 2 * DAY) }), NOW)).toEqual({ attempt: false, grade: true });
  });
});

describe('studentExamState', () => {
  const state = (over: Record<string, unknown> = {}, attempt: Parameters<typeof studentExamState>[0]['attempt'] = null, released = false, now = NOW) =>
    studentExamState({ exam: exam(over), attempt, released, nowMs: now });

  it('shows a draft and an exam that has not opened as Scheduled, with no button', () => {
    expect(state({ status: 'draft' })).toEqual({ label: 'Scheduled', action: null });
    expect(state({ opensAt: ts(NOW + 1000), closesAt: ts(NOW + DAY) })).toEqual({ label: 'Scheduled', action: null });
  });

  it('offers Start while the window is open and the student has not started', () => {
    expect(state()).toEqual({ label: 'Open now', action: 'start' });
    expect(studentExamState({ exam: exam(), attempt: undefined, released: false, nowMs: NOW })).toEqual({ label: 'Open now', action: 'start' });
  });

  it('offers Resume for an attempt in progress, even after the window closed if time is left', () => {
    expect(state({}, { status: 'in_progress', deadlineAtMs: NOW + 600_000 })).toEqual({ label: 'In progress', action: 'resume' });
    const closed = { opensAt: ts(NOW - DAY), closesAt: ts(NOW - 60_000) };
    expect(state(closed, { status: 'in_progress', deadlineAtMs: NOW + 600_000 })).toEqual({ label: 'In progress', action: 'resume' });
  });

  it('calls an attempt that ran past its deadline and grace Missed', () => {
    expect(state({}, { status: 'in_progress', deadlineAtMs: NOW - 120_000 })).toEqual({ label: 'Missed', action: 'view' });
  });

  it('shows Submitted after a submit, and Result released once the score can be read', () => {
    expect(state({}, { status: 'submitted' })).toEqual({ label: 'Submitted', action: 'view' });
    expect(state({}, { status: 'submitted' }, true)).toEqual({ label: 'Result released', action: 'view' });
  });

  it('shows Missed for a closed exam with no attempt, and Closed when the attempt was not read', () => {
    const closed = { opensAt: ts(NOW - DAY), closesAt: ts(NOW - 60_000) };
    expect(state(closed, null)).toEqual({ label: 'Missed', action: null });
    expect(studentExamState({ exam: exam(closed), attempt: undefined, released: false, nowMs: NOW })).toEqual({ label: 'Closed', action: null });
    expect(state({ status: 'closed' }, null)).toEqual({ label: 'Missed', action: null });
  });

  it('shows a finalized exam as Closed', () => {
    const done = { status: 'finalized', opensAt: ts(NOW - 2 * DAY), closesAt: ts(NOW - DAY) };
    expect(state(done, null)).toEqual({ label: 'Closed', action: null });
    expect(state(done, null, true)).toEqual({ label: 'Result released', action: 'view' });
  });
});

describe('scoreView', () => {
  it('shows the score, the percentage to the nearest whole number and the comment', () => {
    expect(scoreView({ score: 17, maxScore: 20, comment: ' Well done ' })).toEqual({ text: '17 / 20', percent: 85, comment: 'Well done' });
    expect(scoreView({ score: 1, maxScore: 3 })?.percent).toBe(33);
    expect(scoreView({ score: 2.5, maxScore: 10 })?.text).toBe('2.5 / 10');
  });

  it('has no percentage when the maximum is zero, and nothing without a score', () => {
    expect(scoreView({ score: 0, maxScore: 0 })?.percent).toBeNull();
    expect(scoreView(null)).toBeNull();
    expect(scoreView(undefined)).toBeNull();
    expect(scoreView({ score: Number.NaN, maxScore: 10 })).toBeNull();
  });
});
