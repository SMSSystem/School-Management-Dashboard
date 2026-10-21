import { describe, expect, it } from 'vitest';
import { listPairs, statusKey, statusTargets, studentListRows, type ExamListDoc, type StatusMaps } from '../examStudentRows';
import sourceRaw from '../../components/exam/StudentExamList.tsx?raw';
import hookRaw from '../../hooks/useStudentExamStatus.ts?raw';
import attemptHookRaw from '../../hooks/useExamAttempt.ts?raw';
import pageRaw from '../../scenes/(dashboard)/list/exams/index.tsx?raw';
import navRaw from '../sidebarNav.ts?raw';

// The student's and the parent's Exams list (EXAMS_FEATURE_SPEC.md §4.5 and §4.6).

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 22, 14, 0, 0);
const ts = (ms: number) => ({ toMillis: () => ms });

const exam = (over: Partial<ExamListDoc> = {}): ExamListDoc => ({
  id: 'e1',
  classId: 'c1',
  subjectId: 's1',
  subjectName: 'Maths',
  title: 'Unit 3 Quiz',
  date: '2026-10-22',
  duration: 45,
  online: true,
  status: 'published',
  opensAt: ts(NOW - 60_000),
  closesAt: ts(NOW + 3_600_000),
  ...over,
});
const empty: StatusMaps = { attempts: new Map(), grades: new Map() };
const student = { role: 'student' as const, uid: 'stu1', membership: { classId: 'c1', classIds: ['c1'] } };

describe('listPairs', () => {
  it('pairs a student with the exams of their classes and subjects', () => {
    const exams = [exam(), exam({ id: 'other', classId: 'c9' })];
    expect(listPairs(exams, student).map((p) => [p.exam.id, p.studentUid, p.child])).toEqual([['e1', 'stu1', null]]);
  });

  it('pairs a parent with each child’s exams, an exam shared by two children once per child', () => {
    const children = [
      { uid: 'k1', name: 'Amy', classId: 'c1', classIds: ['c1'] },
      { uid: 'k2', name: 'Bo', classId: 'c1', classIds: ['c1'] },
      { uid: 'k3', name: 'Cy', classId: 'c3', classIds: ['c3'] },
    ];
    const pairs = listPairs([exam()], { role: 'parent', children });
    expect(pairs.map((p) => p.studentUid)).toEqual(['k1', 'k2']);
    expect(pairs[0].child).toEqual({ uid: 'k1', name: 'Amy' });
  });
});

describe('statusTargets', () => {
  const pairs = listPairs(
    [exam(), exam({ id: 'old', opensAt: ts(NOW - 60 * DAY), closesAt: ts(NOW - 50 * DAY) }), exam({ id: 'draft', status: 'draft' }), exam({ id: 'plain', online: false })],
    student,
  );

  it('asks for the attempt and the score of recent online exams only', () => {
    expect(statusTargets(pairs, 'student', NOW)).toEqual([{ examId: 'e1', studentUid: 'stu1', attempt: true, grade: true }]);
  });

  it('never asks a parent for an attempt', () => {
    const forParent = statusTargets(pairs, 'parent', NOW);
    expect(forParent).toEqual([{ examId: 'e1', studentUid: 'stu1', attempt: false, grade: true }]);
  });

  it('asks for nothing when there is nothing recent', () => {
    expect(statusTargets([], 'student', NOW)).toEqual([]);
  });
});

describe('studentListRows for a student', () => {
  const rows = (maps: StatusMaps = empty, exams: ExamListDoc[] = [exam()]) => studentListRows(listPairs(exams, student), 'student', maps, NOW);

  it('offers Start on an open exam with no attempt', () => {
    expect(rows()[0]).toMatchObject({ title: 'Unit 3 Quiz', online: true, status: 'Open now', action: 'start', result: null });
  });

  it('offers Resume for an attempt in progress and View after a submit', () => {
    const key = statusKey('e1', 'stu1');
    const running: StatusMaps = { attempts: new Map([[key, { status: 'in_progress', deadlineAtMs: NOW + 600_000 }]]), grades: new Map() };
    expect(rows(running)[0]).toMatchObject({ status: 'In progress', action: 'resume' });
    const done: StatusMaps = { attempts: new Map([[key, { status: 'submitted' }]]), grades: new Map() };
    expect(rows(done)[0]).toMatchObject({ status: 'Submitted', action: 'view' });
  });

  it('shows a released score and calls the exam Result released', () => {
    const key = statusKey('e1', 'stu1');
    const graded: StatusMaps = {
      attempts: new Map([[key, { status: 'submitted' }]]),
      grades: new Map([[key, { score: 8, maxScore: 10, comment: 'Good' }]]),
    };
    const row = rows(graded)[0];
    expect(row.status).toBe('Result released');
    expect(row.result).toEqual({ text: '8 / 10', percent: 80, comment: 'Good' });
  });

  it('shows a draft as Scheduled with no button, and a schedule-only exam with no status', () => {
    expect(rows(empty, [exam({ status: 'draft' })])[0]).toMatchObject({ status: 'Scheduled', action: null });
    expect(rows(empty, [exam({ online: false, status: undefined, opensAt: undefined, closesAt: undefined })])[0]).toMatchObject({
      online: false,
      status: null,
      action: null,
    });
  });

  it('shows an old exam, whose attempt was not read, as Closed', () => {
    const old = exam({ opensAt: ts(NOW - 60 * DAY), closesAt: ts(NOW - 50 * DAY) });
    expect(rows(empty, [old])[0]).toMatchObject({ status: 'Closed', action: null });
  });

  it('lists the most recent date first', () => {
    const list = rows(empty, [exam({ id: 'a', date: '2026-10-01' }), exam({ id: 'b', date: '2026-10-22' }), exam({ id: 'c', date: '2026-10-10' })]);
    expect(list.map((r) => r.exam.id)).toEqual(['b', 'c', 'a']);
  });
});

describe('studentListRows for a parent', () => {
  const children = [
    { uid: 'k1', name: 'Zed', classId: 'c1', classIds: ['c1'] },
    { uid: 'k2', name: 'Amy', classId: 'c1', classIds: ['c1'] },
  ];
  const rows = (maps: StatusMaps = empty) => studentListRows(listPairs([exam()], { role: 'parent', children }), 'parent', maps, NOW);

  it('has one row per child, by name, each with its own key and no button', () => {
    const list = rows();
    expect(list.map((r) => r.child?.name)).toEqual(['Amy', 'Zed']);
    expect(new Set(list.map((r) => r.key)).size).toBe(2);
    expect(list.every((r) => r.action === null)).toBe(true);
  });

  it('shows only Scheduled, Open or Closed until a child’s score is released', () => {
    expect(rows()[0].status).toBe('Open');
    const closed = studentListRows(listPairs([exam({ opensAt: ts(NOW - DAY), closesAt: ts(NOW - 60_000) })], { role: 'parent', children }), 'parent', empty, NOW);
    expect(closed[0].status).toBe('Closed');
    expect(studentListRows(listPairs([exam({ status: 'draft' })], { role: 'parent', children }), 'parent', empty, NOW)[0].status).toBe('Scheduled');
  });

  it('shows each child’s own released score', () => {
    const maps: StatusMaps = { attempts: new Map(), grades: new Map([[statusKey('e1', 'k2'), { score: 5, maxScore: 10 }]]) };
    const list = rows(maps);
    expect(list[0].child?.name).toBe('Amy');
    expect(list[0]).toMatchObject({ status: 'Result released', result: { text: '5 / 10', percent: 50 } });
    expect(list[1]).toMatchObject({ status: 'Open', result: null });
  });
});

describe('the list component, its hook and the page', () => {
  const component = sourceRaw.split('\r\n').join('\n');
  const hook = hookRaw.split('\r\n').join('\n');
  const page = pageRaw.split('\r\n').join('\n');

  it('is what a student and a parent see on the Exams page; staff keep the staff list', () => {
    expect(page).toContain('if (audience === "student_parent") return <StudentExamList');
    expect(page.indexOf('if (audience === "student_parent")')).toBeLessThan(page.indexOf('const renderRow ='));
  });

  it('reads attempts and scores through a cached query by id, with no listener, and keeps it in memory only', () => {
    expect(hook).not.toMatch(/onSnapshot|getDocs/);
    expect(hook).toContain('staleTime: LIST_STALE_MS');
    expect(hook).toContain('loadMyAttempt(institutionId!, t.examId, uid)');
    expect(hook).toContain('loadGrade(institutionId!, t.examId, t.studentUid)');
  });

  it('shows cards on a phone, a Child column for a parent only, and a Start / Resume / View link', () => {
    expect(component).toContain('renderCard={renderCard}');
    expect(component).toContain('...(isParent ? [{ header: "Child", accessor: "child" }] : [])');
    expect(component).toContain('`/dashboard/list/exams/${row.exam.id}/take`');
    expect(component).toContain('{ start: "Start", resume: "Resume", view: "View" }');
  });

  it('refreshes the statuses when an attempt starts or ends', () => {
    const attempt = attemptHookRaw.split('\r\n').join('\n');
    expect(attempt.match(/invalidateQueries\(\{ queryKey: \[EXAM_STATUS_QUERY_KEY\] \}\)/g)).toHaveLength(2);
  });

  it('shows Exams in the sidebar for a student again', () => {
    const nav = navRaw.split('\r\n').join('\n');
    const hidden = nav.slice(nav.indexOf('export const STUDENT_TEMPORARILY_HIDDEN'), nav.indexOf('export const TEACHER_TEMPORARILY_HIDDEN'));
    expect(hidden).not.toContain('"Exams"');
    expect(hidden).toContain('"Report Cards"');
  });
});
