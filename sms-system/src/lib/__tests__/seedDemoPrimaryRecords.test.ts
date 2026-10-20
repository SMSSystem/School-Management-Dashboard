import { describe, expect, it } from 'vitest';
import {
  CONTENT_TERM,
  MANUAL_ASSESSMENTS,
  RUBRIC_BY_TITLE,
  buildDisciplinary,
  buildManualResults,
  buildRubricLinks,
  buildRubrics,
  gpaPoints,
  letterGrade,
  STUDENT_COUNT,
  TERMS,
  buildAttendanceSummaries,
  buildDatedPlan,
  countSchoolDays,
  generalRegisters,
  schoolDays,
} from '../../../scripts/seedDemoPrimaryLogic.mjs';
import { gpaPoints as appGpaPoints, letterGrade as appLetterGrade } from '../reportCardUtils';
import { ID, TODAY, people, subjects, dated, Doc, d, classGrade } from './seedDemoPrimaryFixture';

// The Blue Mountain Primary School demo seed, part: records. Shared setup is in seedDemoPrimaryFixture.ts.

describe('the dated records', () => {
  it('counts what a school of 12 classes would have by 15 Oct', () => {
    expect(dated.generalAttendance).toHaveLength(12 * 29 * 2);
    expect(dated.subjectAttendance.length).toBeGreaterThan(800);
    expect(dated.assignments).toHaveLength(subjects.reduce((n, s) => n + s.classes.length, 0) * 2);
    expect(dated.lessonNotes).toHaveLength(12 * 4 * 6);
    // two columns have arrived: Homework 1 (25 Sep) and Quiz 1 (9 Oct)
    expect(dated.results).toHaveLength(2 * people.students.reduce((n, s) => n + subjects.filter((x) => x.classes.some((c) => c.id === s.classId)).length, 0));
  });

  it('is append-only: seeding through a later date only adds records at the end of each list', () => {
    const earlier = buildDatedPlan(ID, people, subjects, '2026-10-01');
    for (const key of Object.keys(dated)) {
      const a = earlier[key];
      const b = dated[key];
      expect(b.length, key).toBeGreaterThanOrEqual(a.length);
      for (let i = 0; i < a.length; i++) {
        expect(b[i].path, `${key}[${i}]`).toBe(a[i].path);
      }
      // and the earlier records are identical in content, not just in id
      expect(JSON.stringify(b.slice(0, a.length))).toBe(JSON.stringify(a));
    }
  });

  it('writes nothing dated after the seed date', () => {
    for (const i of dated.generalAttendance) expect((i.data as { date: string }).date <= TODAY).toBe(true);
    for (const i of dated.subjectAttendance) expect((i.data as { sessionDate: string }).sessionDate <= TODAY).toBe(true);
    for (const i of dated.results) expect((i.data as { date: string }).date <= TODAY).toBe(true);
    for (const i of dated.lessonNotes) expect((i.data as { createdAt: Date }).createdAt.toISOString().slice(0, 10) <= TODAY).toBe(true);
    for (const i of dated.assignments) expect((i.data as { createdAt: Date }).createdAt.toISOString().slice(0, 10) <= TODAY).toBe(true);
  });

  it('marks attendance plausibly: valid states, a reason on every excused mark, mostly present', () => {
    // There are about 14,000 marks, so the faults are collected and asserted once: an expect() per mark (four of
    // them) took over 5 s, the test's timeout, whenever the whole suite ran in parallel.
    const faults: string[] = [];
    let present = 0;
    let total = 0;
    for (const i of dated.generalAttendance) {
      const records = (i.data as { records: Record<string, { state: string; reason?: string; studentName: string }> }).records;
      for (const [uid, r] of Object.entries(records)) {
        const badState = !['P', 'A', 'L', 'E'].includes(r.state); // a reason exactly when the state is E, and a name
        if (badState || (r.state === 'E' ? !r.reason : r.reason !== undefined) || !r.studentName) faults.push(`${i.path} ${uid}: ${JSON.stringify(r)}`);
        total++;
        if (r.state === 'P') present++;
      }
    }
    expect({ count: faults.length, first: faults.slice(0, 10) }).toEqual({ count: 0, first: [] });
    expect(present / total).toBeGreaterThan(0.85);
    expect(present / total).toBeLessThan(0.99);
  });

  it('usually repeats a morning absence in the afternoon', () => {
    const students = people.students.filter((s) => s.classId === 'class_g3A');
    let amAbsent = 0;
    let both = 0;
    for (const d of schoolDays('2026-12-18')) {
      const regs = generalRegisters(students, 'class_g3A', d);
      for (const s of students) {
        if (regs.AM[s.uid].state === 'A') {
          amAbsent++;
          if (regs.PM[s.uid].state === 'A') both++;
        }
      }
    }
    expect(amAbsent).toBeGreaterThan(5);
    expect(both / amAbsent).toBeGreaterThan(0.6);
  });

  it('records one general register per class, day and session, and subject registers only on the subject days', () => {
    const ids = new Set(dated.generalAttendance.map((i) => i.path));
    expect(ids.size).toBe(dated.generalAttendance.length);
    for (const i of dated.subjectAttendance) {
      const d = i.data as { subjectId: string; sessionDate: string };
      const subject = subjects.find((s) => s.id === d.subjectId)!;
      expect(subject.days).toContain(new Date(`${d.sessionDate}T12:00:00Z`).getUTCDay());
    }
  });

  it('gives each assignment a due date after it was posted, and valid fields', () => {
    for (const i of dated.assignments) {
      const d = i.data as { dueDate: string; createdAt: Date; status: string; type: string; gradingMode: string; title: string };
      expect(d.dueDate > d.createdAt.toISOString().slice(0, 10)).toBe(true);
      expect(d.status).toBe('published');
      expect(d.gradingMode).toBe('standalone');
      expect(d.title).toBeTruthy();
    }
  });

  it('keeps every mark within its maximum, and only for columns that have arrived', () => {
    const cols = new Set(dated.results.map((i) => (i.data as { gradebookColumnId: string }).gradebookColumnId));
    expect([...cols].sort()).toEqual(['col1', 'col2']);
    for (const i of dated.results) {
      const d = i.data as { score: number; maxScore: number };
      expect(d.score).toBeGreaterThanOrEqual(0);
      expect(d.score).toBeLessThanOrEqual(d.maxScore);
    }
  });

  it('names lesson notes by week for the four core subjects only', () => {
    const names = new Set(dated.lessonNotes.map((i) => (i.data as { subjectName: string }).subjectName));
    expect([...names].sort()).toEqual(['Language Arts', 'Mathematics', 'Science', 'Social Studies']);
    expect((dated.lessonNotes[0].data as { name: string }).name).toMatch(/^Week 1: /);
    for (const i of dated.lessonNotes) expect((i.data as { hasAttachment: boolean }).hasAttachment).toBe(false);
  });
});

describe('the attendance summaries', () => {
  const summaries = buildAttendanceSummaries(ID, people, TODAY);

  it('has one per student and uses the app formula, with the whole term as the denominator', () => {
    expect(summaries).toHaveLength(STUDENT_COUNT);
    const expected = countSchoolDays(TERMS[0].startDate, TERMS[0].endDate) * 2;
    for (const s of summaries) {
      const d = s.data as { P: number; L: number; A: number; E: number; S: number; B: number; totalExpectedSessions: number; attendanceRate: number; filledSessions: number; sessionsAbsent: number };
      expect(d.totalExpectedSessions).toBe(expected);
      expect(d.attendanceRate).toBeCloseTo(((d.P + d.L) / expected) * 100, 6);
      expect(d.filledSessions).toBe(d.P + d.A + d.L + d.S + d.E + d.B);
      expect(d.sessionsAbsent).toBe(d.A + d.S + d.E);
      // 29 days x 2 sessions marked so far
      expect(d.filledSessions).toBe(58);
    }
  });
});

describe('grades: copied from the app', () => {
  it('uses the same letter bands and GPA points as reportCardUtils.ts', () => {
    for (let score = 0; score <= 100; score += 0.5) {
      expect(letterGrade(score), String(score)).toBe(appLetterGrade(score));
    }
    for (const l of ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E'] as const) {
      expect(gpaPoints(l), l).toBe(appGpaPoints(l));
    }
  });
});

describe('rubrics', () => {
  const rubrics = buildRubrics(ID, people);

  it('has six rubrics of four criteria and four descending levels, created by a senior teacher', () => {
    expect(rubrics).toHaveLength(6);
    for (const r of rubrics) {
      const rubric = d(r);
      expect(rubric.criteria).toHaveLength(4);
      expect(rubric.createdByRole).toBe('senior_teacher');
      expect(new Set(rubric.criteria.map((c: Doc) => c.id)).size).toBe(4);
      for (const c of rubric.criteria) {
        expect(c.maxPoints).toBe(4);
        expect(c.levels.map((l: Doc) => l.points)).toEqual([4, 3, 2, 1]);
      }
    }
  });

  it('attaches rubrics to grade 4-6 assignments only, by title, and only to rubrics that exist', () => {
    const ids = new Set(rubrics.map((r) => r.path.split('/').pop()));
    const linked = dated.assignments.filter((i) => d(i).rubricId);
    expect(linked).toHaveLength(30);
    for (const i of linked) {
      expect(ids.has(d(i).rubricId)).toBe(true);
      expect(classGrade(i)).toBeGreaterThanOrEqual(4);
      expect(RUBRIC_BY_TITLE[d(i).title]).toBeTruthy();
    }
    for (const i of dated.assignments.filter((x) => classGrade(x) < 4)) {
      expect(d(i).rubricId).toBeUndefined();
    }
  });

  it('patches exactly those assignments, as updates', () => {
    const links = buildRubricLinks(ID, subjects, TODAY);
    expect(links).toHaveLength(30);
    const paths = new Set(dated.assignments.map((i) => i.path));
    for (const l of links) {
      expect(l.mode).toBe('update');
      expect(paths.has(l.path)).toBe(true);
      expect(Object.keys(l.data)).toEqual(['rubricId']);
    }
  });
});

describe('manual-entry results (the Results page hides gradebook marks)', () => {
  const manual = buildManualResults(ID, people, subjects, TODAY);

  it('has two assessments per core subject by 15 Oct, with real names and no gradebook fields', () => {
    expect(manual).toHaveLength(2000);
    const names = new Set(manual.map((i) => d(i).assessmentName));
    expect([...names].sort()).toEqual(
      Object.values(MANUAL_ASSESSMENTS).flatMap((list) => list.slice(0, 2).map((a) => a.name)).sort(),
    );
    for (const i of manual) {
      expect(d(i).gradebookColumnId).toBeUndefined();
      expect(d(i).source).toBeUndefined();
      expect(d(i).columnWeight).toBeUndefined();
      expect(d(i).assessmentType).toBe('coursework');
      expect(d(i).score).toBeGreaterThanOrEqual(0);
      expect(d(i).score).toBeLessThanOrEqual(d(i).maxScore);
      expect(d(i).date <= TODAY).toBe(true);
    }
  });

  it('never shares a document id with a gradebook result', () => {
    const gradebook = new Set(dated.results.map((i) => i.path));
    for (const i of manual) expect(gradebook.has(i.path), i.path).toBe(false);
  });

  it('covers the four core subjects only', () => {
    const subjectIds = new Set(manual.map((i) => d(i).subjectId));
    expect([...subjectIds].sort()).toEqual(['subject_language-arts', 'subject_mathematics', 'subject_science', 'subject_social-studies']);
  });
});

describe('disciplinary actions', () => {
  const discipline = buildDisciplinary(ID, people, TODAY);

  it('is a primary-school mix, dated inside Term 1 and not after the seed date', () => {
    expect(discipline.length).toBeGreaterThan(20);
    expect(discipline.length).toBeLessThan(120);
    const counts: Record<string, number> = {};
    for (const i of discipline) {
      const a = d(i);
      counts[a.type] = (counts[a.type] ?? 0) + 1;
      expect(['merit', 'demerit', 'detention', 'suspension']).toContain(a.type);
      expect(a.date >= CONTENT_TERM.startDate && a.date <= TODAY).toBe(true);
      expect(a.reason).toBeTruthy();
      expect(['institution_admin', 'senior_teacher', 'regular_teacher']).toContain(a.issuedByRole);
      if (a.type === 'detention' || a.type === 'suspension') {
        expect(a.endDate >= a.date).toBe(true);
        expect(typeof a.served).toBe('boolean');
      } else {
        expect(a.endDate).toBeUndefined();
        expect(a.served).toBeUndefined();
      }
    }
    expect(counts.merit).toBeGreaterThan(counts.demerit);
    expect(counts.suspension ?? 0).toBeLessThanOrEqual(5);
  });

  it('gives a student the same records however late the seed date, only more of them', () => {
    const later = buildDisciplinary(ID, people, '2026-12-18');
    expect(later.length).toBeGreaterThan(discipline.length);
    const laterPaths = new Map(later.map((i) => [i.path, d(i).date]));
    for (const i of discipline) expect(laterPaths.get(i.path)).toBe(d(i).date);
  });
});
