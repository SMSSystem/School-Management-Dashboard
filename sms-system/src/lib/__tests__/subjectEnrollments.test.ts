import { describe, expect, it } from 'vitest';
import { enrollmentDocId, isStaleEnrollment, liveEnrollments, type SubjectLike } from '../subjectEnrollments';
import {
  isStaleEnrollment as scriptIsStale,
  planPrune,
} from '../../../scripts/pruneStaleSubjectEnrollmentsLogic.mjs';
import scriptRaw from '../../../scripts/prune-stale-subject-enrollments.mjs?raw';
import { subjectFormSource as subjectFormRaw } from './subjectFormSource';
import formModalRaw from '../../components/FormModal.tsx?raw';
import myAttendanceRaw from '../../scenes/(dashboard)/attendance/my/index.tsx?raw';
import childAttendanceRaw from '../../scenes/(dashboard)/attendance/child/index.tsx?raw';
import attendanceHooksRaw from '../../hooks/useMyAttendance.ts?raw';
import attendanceRowsRaw from '../attendanceRows.ts?raw';

// Stale subject enrollments: an enrollment left behind after its subject dropped the
// class or was deleted showed a subject the student does not take in My Attendance >
// By Subject. The rule is pure and shared; the Subject form and the delete flow remove
// enrollments; the attendance pages ignore stale ones; a script clears existing ones.

const lf = (s: string) => s.split('\r\n').join('\n');
const subjectForm = lf(subjectFormRaw);
const formModal = lf(formModalRaw);
const script = lf(scriptRaw);

const SUBJECTS: SubjectLike[] = [
  { id: 's-class', classScope: 'class', classIds: ['c1'] },
  { id: 's-inst', classScope: 'institution', classIds: [] },
  { id: 's-old' }, // an older subject with no scope
  { id: 's-noclasses', classScope: 'class' }, // a class-scoped subject with no list at all
];
const byId = new Map(SUBJECTS.map((s) => [s.id, s]));
const e = (subjectId: string, classId: string) => ({ subjectId, classId });

describe('isStaleEnrollment', () => {
  it('is fine when the subject still lists the class', () => {
    expect(isStaleEnrollment(e('s-class', 'c1'), byId)).toBe(false);
  });

  it('is stale when the subject dropped the class', () => {
    expect(isStaleEnrollment(e('s-class', 'c2'), byId)).toBe(true);
  });

  it('is stale when the subject no longer exists', () => {
    expect(isStaleEnrollment(e('gone', 'c1'), byId)).toBe(true);
  });

  it('never calls an institution-wide or unscoped subject stale', () => {
    expect(isStaleEnrollment(e('s-inst', 'anything'), byId)).toBe(false);
    expect(isStaleEnrollment(e('s-old', 'anything'), byId)).toBe(false);
  });

  it('a class-scoped subject with no class list enrols no class', () => {
    expect(isStaleEnrollment(e('s-noclasses', 'c1'), byId)).toBe(true);
  });
});

describe('liveEnrollments', () => {
  it('drops the stale ones and keeps the order and the extra fields', () => {
    const all = [
      { ...e('s-class', 'c1'), subjectName: 'A' },
      { ...e('s-class', 'c2'), subjectName: 'B' },
      { ...e('gone', 'c1'), subjectName: 'C' },
      { ...e('s-inst', 'c9'), subjectName: 'D' },
    ];
    expect(liveEnrollments(all, SUBJECTS).map((x) => x.subjectName)).toEqual(['A', 'D']);
  });

  it('keeps everything when there is nothing stale, and drops everything with no subjects', () => {
    expect(liveEnrollments([e('s-class', 'c1')], SUBJECTS)).toHaveLength(1);
    expect(liveEnrollments([e('s-class', 'c1')], [])).toEqual([]);
  });

  it('enrollmentDocId matches the id the Subject form writes', () => {
    expect(enrollmentDocId('sub', 'cls')).toBe('sub_cls');
    expect(subjectForm).toContain("institutionDoc(institutionId, 'subjectEnrollments', `${subjectId}_${cls.id}`)");
  });
});

describe('the script’s rule is the app’s rule', () => {
  const cases = [
    e('s-class', 'c1'),
    e('s-class', 'c2'),
    e('gone', 'c1'),
    e('s-inst', 'x'),
    e('s-old', 'x'),
    e('s-noclasses', 'c1'),
  ];

  it('agrees on every case', () => {
    for (const c of cases) expect(scriptIsStale(c, byId), JSON.stringify(c)).toBe(isStaleEnrollment(c, byId));
  });

  it('planPrune splits keep and stale with a reason', () => {
    const rows = cases.map((c, i) => ({ id: `${c.subjectId}_${c.classId}_${i}`, ...c }));
    const { keep, stale } = planPrune(rows, SUBJECTS);
    expect(keep.map((r) => r.id)).toEqual(rows.filter((r) => !isStaleEnrollment(r, byId)).map((r) => r.id));
    expect(stale.map((r) => r.reason)).toEqual([
      'class not in the subject',
      'no such subject',
      'class not in the subject',
    ]);
    expect(keep.length + stale.length).toBe(rows.length);
  });
});

describe('the Subject form removes enrollments of classes no longer enrolled', () => {
  it('reads this subject’s enrollments fresh and deletes those not in the new set, in one batch', () => {
    const w = subjectForm.slice(subjectForm.indexOf('async function writeEnrollments'), subjectForm.indexOf('const onSubmit'));
    expect(w).toContain("where('subjectId', '==', subjectId)");
    expect(w).toContain('const keep = new Set(classesToEnroll.map((c) => enrollmentDocId(subjectId, c.id)));');
    expect(w).toContain('existing.docs.filter((d) => !keep.has(d.id))');
    expect(w).toContain('stale.forEach((d) => batch.delete(d.ref));');
    // after the enrollments are written, not before
    expect(w.indexOf('setDoc(')).toBeLessThan(w.indexOf('const keep'));
  });
});

describe('deleting a subject removes its enrollments', () => {
  const block = (() => {
    const a = formModal.indexOf('if (table === "subject") {');
    expect(a).toBeGreaterThan(-1);
    return formModal.slice(a, formModal.indexOf('if (table === "assignment") {', a));
  })();

  it('queries the enrollments by subject and deletes them with the subject in one batch', () => {
    expect(block).toContain('where("subjectId", "==", String(id))');
    expect(block).toContain('enrollments.docs.forEach((d) => batch.delete(d.ref));');
    expect(block).toContain('batch.delete(institutionDoc(institutionId!, collectionNameFor(table), String(id)));');
    expect(block.indexOf('enrollments.docs.forEach')).toBeLessThan(block.indexOf('await batch.commit();'));
  });
});

describe('the attendance pages ignore stale enrollments', () => {
  // Both pages get their subject cards from useMySubjectAttendance (hooks/useMyAttendance.ts), which filters the
  // shared enrollments through eligibleEnrollments (lib/attendanceRows.ts).
  for (const [name, raw] of [
    ['My Attendance', myAttendanceRaw],
    ['Child Attendance', childAttendanceRaw],
  ] as const) {
    it(`${name} takes its subject cards from the hook that filters stale enrollments`, () => {
      expect(lf(raw)).toContain('useMySubjectAttendance(');
    });
  }

  it('the hook filters through liveEnrollments with the cached subjects, falling back to all if they cannot be read', () => {
    const hook = lf(attendanceHooksRaw);
    expect(hook).toContain('const subjectList = subjects.isError ? null : (subjects.data ?? null);');
    expect(hook).toContain('eligibleEnrollments(enrollments.data, subjectList, member, uid as string)');
    const rows = lf(attendanceRowsRaw);
    expect(rows).toContain('subjects ? liveEnrollments(enrollments, subjects) : [...enrollments]');
    expect(rows.indexOf('liveEnrollments(enrollments, subjects)')).toBeLessThan(rows.indexOf('isInClass('));
  });
});

describe('the prune script', () => {
  it('is a dry run unless --live is given, and deletes only behind that flag', () => {
    expect(script).toContain("if (arg === '--live') opts.live = true;");
    expect(script).toMatch(/const opts = \{[^}]*\blive: false\b/);
    expect(script.match(/opts\.live = true/g)).toHaveLength(1);
    expect(script).toContain('if (opts.live) {\n      for (let i = 0; i < stale.length; i += BATCH) {');
    expect(script.indexOf('batch.delete(e.ref)')).toBeGreaterThan(script.indexOf('if (opts.live) {'));
  });

  it('limits a run to one institution with a safe id, and logs without personal data', () => {
    expect(script).toContain("else if (arg.startsWith('--institution=')) opts.institution");
    expect(script).toContain('/^[A-Za-z0-9_-]{1,64}$/.test(opts.institution)');
    const log = script.slice(script.indexOf('log.push({'), script.indexOf('log.push({') + 260);
    expect(log).not.toMatch(/studentId|email|name:\s*e\.name/);
  });
});
