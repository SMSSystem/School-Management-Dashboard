import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  CONTENT_TERM,
  MANUAL_ASSESSMENTS,
  PROGRESS_SNAPSHOTS,
  RUBRIC_BY_TITLE,
  SIGNATURE_PATCH_UNTIL,
  buildDisciplinary,
  buildExtras,
  buildManualResults,
  buildProgressReports,
  buildReportCards,
  buildResults,
  buildRubricLinks,
  buildRubrics,
  buildSignatureFix,
  todayInJamaica,
  feedbackFor,
  gpaPoints,
  isDemoLoginUid,
  letterGrade,
  termId,
  GRADEBOOK_COLUMNS,
  LOGIN_UIDS,
  SCHOOL,
  STUDENT_COUNT,
  TERMS,
  YEAR,
  buildAttendanceSummaries,
  buildDatedPlan,
  buildPeople,
  buildStaticPlan,
  buildSubjects,
  clampThrough,
  contentThrough,
  countSchoolDays,
  generalRegisters,
  isSafePath,
  jamaicanPublicHolidays,
  maskEmail,
  schoolDays,
  termStatus,
  type Item,
} from '../../../scripts/seedDemoPrimaryLogic.mjs';
import { getJamaicanPublicHolidays } from '../holidays';
import { COMMENT_KEY } from '../commentKey';
import { gpaPoints as appGpaPoints, letterGrade as appLetterGrade } from '../reportCardUtils';
import clearRaw from '../../../scripts/clear-demo-activity-log.mjs?raw';
import scriptRaw from '../../../scripts/seed-demo-primary-school.mjs?raw';
import gitignoreRaw from '../../../.gitignore?raw';

// The Blue Mountain Primary School demo seed: the roster, the calendar, the dated records,
// and the script's safety rules. Everything is a pure function of (institutionId, through).

const ID = 'demoInstitution1';
const TODAY = '2026-10-15';
const script = scriptRaw.split('\r\n').join('\n');

const people = buildPeople();
const subjects = buildSubjects(people);
const dated = buildDatedPlan(ID, people, subjects, TODAY);

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (value instanceof Date || value === null || typeof value !== 'object') return false;
  return Object.values(value as Record<string, unknown>).some(hasUndefined);
}

describe('the roster', () => {
  it('has 250 students in 12 classes of sensible size, and every other role it should', () => {
    expect(people.students).toHaveLength(STUDENT_COUNT);
    expect(CLASSES).toHaveLength(12);
    for (const c of CLASSES) {
      const n = people.students.filter((s) => s.classId === c.id).length;
      expect(n, c.id).toBeGreaterThanOrEqual(15);
      expect(n, c.id).toBeLessThanOrEqual(30);
    }
    expect(people.seniors).toHaveLength(6);
    expect(people.regulars).toHaveLength(10);
    expect(people.admin.role).toBe('institution_admin');
    expect(people.spectator.role).toBe('spectator');
  });

  it('gives everyone a unique alphanumeric id and a unique name and email', () => {
    const all = [people.admin, people.spectator, ...people.seniors, ...people.regulars, ...people.students, ...people.parents];
    expect(new Set(all.map((p) => p.uid)).size).toBe(all.length);
    expect(new Set(all.map((p) => p.email)).size).toBe(all.length);
    expect(new Set(all.map((p) => p.name)).size).toBe(all.length);
    for (const p of all) expect(p.uid, p.uid).toMatch(/^bmps[a-z]{3}\d{3}$/);
    for (const p of all) expect(p.email.endsWith(`@${SCHOOL.emailDomain}`), p.email).toBe(true);
  });

  it('puts siblings in different grades under one surname, with the parents linked to all of them', () => {
    const byParent = new Map<string, string[]>();
    for (const l of people.links) byParent.set(l.parentUid, [...(byParent.get(l.parentUid) ?? []), l.studentUid]);
    const students = new Map(people.students.map((s) => [s.uid, s]));
    for (const [parentUid, kids] of byParent) {
      const parent = people.parents.find((p) => p.uid === parentUid)!;
      const grades = kids.map((k) => students.get(k)!.grade);
      expect(new Set(grades).size, parentUid).toBe(grades.length);
      for (const k of kids) expect(students.get(k)!.lastName).toBe(parent.lastName);
    }
    // every student has at least one parent
    const linked = new Set(people.links.map((l) => l.studentUid));
    for (const s of people.students) expect(linked.has(s.uid), s.uid).toBe(true);
    expect(people.parents.length).toBeGreaterThan(150);
    expect(people.parents.length).toBeLessThan(260);
  });

  it('makes the first parent and first student of the first family the demo logins, and they are linked', () => {
    expect(LOGIN_UIDS).toEqual(['bmpsadm001', 'bmpsspe001', 'bmpssen001', 'bmpsreg001', 'bmpspar001', 'bmpsstu001']);
    expect(people.links.some((l) => l.parentUid === 'bmpspar001' && l.studentUid === 'bmpsstu001')).toBe(true);
  });

  it('ages students by grade and spreads them over the four houses', () => {
    for (const s of people.students) {
      const age = 2026 - Number(s.dateOfBirth.slice(0, 4));
      expect(age, `${s.uid} grade ${s.grade}`).toBeGreaterThanOrEqual(s.grade + 5);
      expect(age).toBeLessThanOrEqual(s.grade + 6);
    }
    const houses = new Set(people.students.map((s) => s.houseKey));
    expect(houses.size).toBe(4);
  });

  it('is the same every time', () => {
    expect(JSON.stringify(buildPeople())).toBe(JSON.stringify(people));
  });
});

describe('the calendar', () => {
  it('runs September 2026 to July 2027 in three terms, Christmas, Easter and Summer', () => {
    expect(YEAR).toMatchObject({ startDate: '2026-09-01', endDate: '2027-07-31' });
    expect(TERMS.map((t) => t.name)).toEqual(['Christmas Term', 'Easter Term', 'Summer Term']);
    expect(TERMS[0].startDate).toBe('2026-09-07');
    for (const t of TERMS) {
      expect(t.startDate >= YEAR.startDate && t.endDate <= YEAR.endDate).toBe(true);
    }
  });

  it("agrees with the app's own Jamaican public holidays", () => {
    const local = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const year of [2026, 2027]) {
      expect(jamaicanPublicHolidays(year)).toEqual(
        getJamaicanPublicHolidays(year).map((h) => ({ name: h.name, date: local(h.date) })),
      );
    }
  });

  it('has 29 school days from 7 Sep to 15 Oct 2026, no weekends, and skips National Heroes Day', () => {
    const days = schoolDays(TODAY);
    expect(days).toHaveLength(29);
    expect(days[0]).toBe('2026-09-07');
    expect(days[days.length - 1]).toBe(TODAY);
    for (const d of days) expect([0, 6]).not.toContain(new Date(`${d}T12:00:00Z`).getUTCDay());
    expect(schoolDays('2026-10-21')).not.toContain('2026-10-19');
    expect(schoolDays('2026-10-21')).toContain('2026-10-20');
  });

  it('never counts the gaps between terms', () => {
    const days = schoolDays('2027-07-31');
    expect(days).not.toContain('2026-12-23');
    expect(days).not.toContain('2027-01-04');
    expect(countSchoolDays(TERMS[0].startDate, TERMS[0].endDate)).toBe(schoolDays(TERMS[0].endDate).length);
  });

  it('derives a term status from the dates alone', () => {
    expect(termStatus(TERMS[0], TODAY)).toBe('active');
    expect(termStatus(TERMS[1], TODAY)).toBe('upcoming');
    expect(termStatus(TERMS[0], '2027-01-05')).toBe('completed');
  });

  it('never seeds into the future or past the last term', () => {
    expect(clampThrough(undefined, TODAY)).toBe(TODAY);
    expect(clampThrough('2026-11-01', TODAY)).toBe(TODAY);
    expect(clampThrough('2026-09-30', TODAY)).toBe('2026-09-30');
    expect(clampThrough(undefined, '2028-01-01')).toBe(TERMS[2].endDate);
    expect(contentThrough('2027-02-01')).toBe(CONTENT_TERM.endDate);
    expect(contentThrough('2026-10-15')).toBe('2026-10-15');
  });
});

describe('the static documents', () => {
  const { items } = buildStaticPlan(ID, TODAY);
  const byPath = new Map(items.map((i: Item) => [i.path, i.data]));

  it('writes the institution with every field the Institution Profile wizard saves, complete', () => {
    const inst = byPath.get(`institutions/${ID}`)!;
    expect(inst).toMatchObject({
      name: 'Blue Mountain Primary School',
      profileComplete: true,
      calendarMode: 'academic_year',
      status: 'active',
      classSupervisorLabel: 'Class Teacher',
      principalLabel: 'Principal',
    });
    for (const k of ['motto', 'phone', 'email', 'address', 'authorizedSignature', 'gradeSupervisorLabel', 'vicePrincipalLabel', 'gradingSystem']) {
      expect(inst, k).toHaveProperty(k);
    }
    expect(byPath.has(`registration_directory/${ID}`)).toBe(true);
  });

  it('writes one active academic year, three terms and the public holidays', () => {
    const year = [...byPath.entries()].filter(([p]) => p.includes('/academicYears/'));
    expect(year).toHaveLength(1);
    expect(year[0][1]).toMatchObject({ status: 'active', schoolWeekDays: [1, 2, 3, 4, 5] });
    const terms = [...byPath.entries()].filter(([p]) => p.includes('/terms/'));
    expect(terms.map(([, d]) => (d as { status: string }).status)).toEqual(['active', 'upcoming', 'upcoming']);
    const nsd = [...byPath.keys()].filter((p) => p.includes('/nonSchoolDays/'));
    expect(nsd).toContain(`institutions/${ID}/nonSchoolDays/nsd_2026-10-19`);
  });

  it('writes 4 houses, 4 departments, 12 classes and one document per person', () => {
    const count = (frag: string) => [...byPath.keys()].filter((p) => p.includes(frag)).length;
    expect(count('/houses/')).toBe(4);
    expect(count('/departments/')).toBe(4);
    expect(count('/classes/')).toBe(12);
    expect([...byPath.keys()].filter((p) => p.startsWith('users/'))).toHaveLength(
      2 + people.seniors.length + people.regulars.length + people.students.length + people.parents.length,
    );
    expect([...byPath.keys()].filter((p) => p.startsWith('student_parents/'))).toHaveLength(people.links.length);
  });

  it('sets up subjects like the Subject form: parallel teacher arrays, an assistant who is one of the teachers', () => {
    for (const s of subjects) {
      const doc = byPath.get(`institutions/${ID}/subjects/${s.id}`) as {
        teacherIds: string[];
        teacherNames: string[];
        assistantTeacherId?: string;
        classScope: string;
        cwWeight: number;
        examWeight: number;
      };
      expect(doc.teacherIds.length).toBe(doc.teacherNames.length);
      expect(doc.cwWeight + doc.examWeight).toBe(100);
      if (doc.assistantTeacherId) expect(doc.teacherIds).toContain(doc.assistantTeacherId);
    }
    expect(subjects.filter((s) => s.assistant)).toHaveLength(1);
    const spanish = subjects.find((s) => s.name === 'Spanish')!;
    expect(spanish.classes.every((c) => c.grade >= 4)).toBe(true);
    expect(spanish.wholeSchool).toBe(false);
  });

  it('gives teachers a department, and senior teachers a homeroom class and room', () => {
    for (const t of [...people.seniors, ...people.regulars]) {
      expect(byPath.get(`users/${t.uid}`), t.uid).toHaveProperty('departmentId');
    }
    const senior = byPath.get(`users/${people.seniors[0].uid}`)!;
    expect(senior).toMatchObject({ assignedClassId: 'class_g1A', assignedClassName: 'Grade 1A', homeroomRoom: 'Room 1' });
  });

  it('never leaves a person looking as if they are awaiting a first sign-in', () => {
    for (const [p, d] of byPath) if (p.startsWith('users/')) expect((d as { mustChangePassword: boolean }).mustChangePassword, p).toBe(false);
  });

  it('gradebooks: one per class and subject for Term 1, columns weighted to 100, coursework 60', () => {
    expect(GRADEBOOK_COLUMNS.reduce((n, c) => n + c.columnWeight, 0)).toBe(100);
    expect(GRADEBOOK_COLUMNS.filter((c) => c.assessmentType === 'coursework').reduce((n, c) => n + c.columnWeight, 0)).toBe(60);
    const gb = [...byPath.keys()].filter((p) => /\/gradebooks\/[^/]+$/.test(p));
    expect(gb).toHaveLength(subjects.reduce((n, s) => n + s.classes.length, 0));
    expect(gb[0]).toMatch(new RegExp(`/gradebooks/class_g\\d[AB]_subject_[a-z-]+_${ID}_2026.2027_1$`));
  });

  it('has no undefined values (the Admin SDK rejects them) and every path is inside the demo', () => {
    for (const i of [...items, ...Object.values(dated).flat()]) {
      expect(hasUndefined(i.data), i.path).toBe(false);
      expect(isSafePath(i.path, ID), i.path).toBe(true);
    }
  });
});

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
    let present = 0;
    let total = 0;
    for (const i of dated.generalAttendance) {
      const records = (i.data as { records: Record<string, { state: string; reason?: string; studentName: string }> }).records;
      for (const r of Object.values(records)) {
        expect(['P', 'A', 'L', 'E']).toContain(r.state);
        if (r.state === 'E') expect(r.reason).toBeTruthy();
        else expect(r.reason).toBeUndefined();
        expect(r.studentName).toBeTruthy();
        total++;
        if (r.state === 'P') present++;
      }
    }
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

describe('maskEmail and isSafePath', () => {
  it('masks all but the first character and the domain', () => {
    expect(maskEmail('spectator@bluemountainps.test')).toBe('s***@bluemountainps.test');
  });

  it('accepts only the demo institution, its own ids, and nothing else', () => {
    expect(isSafePath(`institutions/${ID}`, ID)).toBe(true);
    expect(isSafePath(`institutions/${ID}/results/x`, ID)).toBe(true);
    expect(isSafePath(`registration_directory/${ID}`, ID)).toBe(true);
    expect(isSafePath('users/bmpsstu001', ID)).toBe(true);
    expect(isSafePath('student_parents/bmpspar001_bmpsstu001', ID)).toBe(true);
    expect(isSafePath('institutions/otherInstitution/results/x', ID)).toBe(false);
    expect(isSafePath(`institutions/${ID}x/results/x`, ID)).toBe(false);
    expect(isSafePath('users/someRealUid123', ID)).toBe(false);
    expect(isSafePath('registration_directory/other', ID)).toBe(false);
    expect(isSafePath(`institutions/${ID}`, 'x')).toBe(false);
    expect(isSafePath(undefined, ID)).toBe(false);
  });
});

describe('the script', () => {
  it('is a dry run unless --live, needs no key for one, and caps the writes per run', () => {
    expect(script).toContain("if (arg === '--live') opts.live = true;");
    expect(script).toContain('if (live) ({ db, auth } = initAdmin(opts.keyPath));');
    expect(script).toContain('const DEFAULT_BUDGET = 9000;');
  });

  it('checks every path before writing, and refuses a second institution with the same name', () => {
    expect(script).toContain('isSafePath(item.path, institutionId)');
    expect(script).toContain("where('name', '==', SCHOOL.name)");
  });

  it('prints the new passwords once and never saves them: the only file written is the checkpoint', () => {
    expect(script.match(/writeFileSync\(/g)).toHaveLength(1);
    expect(script).toContain('writeFileSync(CHECKPOINT_PATH, JSON.stringify(cp, null, 2));');
    expect(script).not.toMatch(/cp\.[a-zA-Z]*[Pp]assword/);
  });

  it('tears down only the checkpointed institution, only if it carries the demo name, and only demo Auth accounts', () => {
    expect(script).toContain('snap.data().name !== SCHOOL.name');
    expect(script).toContain('endsWith(`@${SCHOOL.emailDomain}`)');
    expect(script).toContain('LOGIN_UIDS.map((uid) => ({ uid }))');
  });

  it('keeps its local checkpoint out of git', () => {
    expect(gitignoreRaw).toContain('scripts/.demo-primary-checkpoint.json');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Part 2: rubrics, manual-entry results, discipline, progress reports, report cards
// ─────────────────────────────────────────────────────────────────────────

const clear = clearRaw.split('\r\n').join('\n');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Doc = Record<string, any>;
const d = (i: Item) => i.data as Doc;
const classGrade = (i: Item) => Number(/class_g(\d)/.exec(d(i).classId)![1]);

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

describe('feedback comments and report-card support data', () => {
  const extras = buildExtras(ID, people, subjects);
  const feedback = extras.filter((i) => i.path.includes('/feedback_comments/'));

  it('has one feedback comment per student and subject, with positive mid-term comment numbers', () => {
    const expected = people.students.reduce((n, s) => n + subjects.filter((x) => x.classes.some((c) => c.id === s.classId)).length, 0);
    expect(feedback).toHaveLength(expected);
    const used = new Set<number>();
    for (const i of feedback) for (const n of d(i).commentNumbers as number[]) used.add(n);
    for (const n of used) {
      const text = COMMENT_KEY[n - 1];
      expect(text, String(n)).toBeTruthy();
      expect(text).not.toMatch(/no respect|very little interest|failed to submit|poor attendance|exam/i);
    }
    for (const i of feedback) expect(['G', 'S', 'F', 'U']).toContain(d(i).conductGrade);
  });

  it('is the same data the report cards use', () => {
    const stu = people.students[3];
    const s = subjects.find((x) => x.classes.some((c) => c.id === stu.classId))!;
    const fb = feedback.find((i) => i.path.endsWith(`/${stu.uid}_${s.id}_${termId(ID, 1)}`))!;
    expect(d(fb).conductGrade).toBe(feedbackFor(stu, s).conductGrade);
  });

  it('has one report-card comment per student, and activities and responsibilities', () => {
    expect(extras.filter((i) => i.path.includes('/reportCardComments/'))).toHaveLength(STUDENT_COUNT);
    expect(extras.filter((i) => i.path.includes('/studentResponsibilities/')).length).toBeGreaterThan(10);
    const activities = extras.filter((i) => i.path.includes('/studentActivities/'));
    expect(activities.length).toBeGreaterThan(100);
    for (const i of activities) expect(d(i).activityName).toBeTruthy();
  });
});

describe('progress reports', () => {
  it('writes one snapshot per student after each column, and none before the first', () => {
    expect(PROGRESS_SNAPSHOTS).toEqual(['2026-10-12', '2026-11-16', '2026-12-11']);
    expect(buildProgressReports(ID, people, subjects, '2026-10-11')).toHaveLength(0);
    expect(dated.progressReports).toHaveLength(STUDENT_COUNT);
    expect(buildProgressReports(ID, people, subjects, '2026-12-18')).toHaveLength(STUDENT_COUNT * 3);
  });

  it('averages every result to the snapshot date (gradebook and manual) and the overall is the mean of the subjects', () => {
    const through = '2026-10-12';
    const results = [...buildResults(ID, people, subjects, through), ...buildManualResults(ID, people, subjects, through)];
    for (const report of dated.progressReports.slice(0, 40)) {
      const r = d(report);
      for (const row of r.subjects) {
        const mine = results.filter((x) => d(x).studentId === r.studentId && d(x).subjectId === row.subjectId);
        const mean = mine.reduce((n, x) => n + (d(x).score / d(x).maxScore) * 100, 0) / mine.length;
        expect(row.average, `${r.studentId} ${row.subjectId}`).toBeCloseTo(Math.round(mean * 10) / 10, 5);
        expect(row.letterGrade).toBe(letterGrade(row.average));
      }
      const overall = r.subjects.reduce((n: number, x: Doc) => n + x.average, 0) / r.subjects.length;
      expect(r.overallAverage).toBeCloseTo(Math.round(overall * 10) / 10, 5);
    }
  });
});

describe('report cards (Report Builder)', () => {
  const cards = buildReportCards(ID, people, subjects, TODAY);

  it('has none before the first gradebook column has marks, then one per student', () => {
    expect(buildReportCards(ID, people, subjects, '2026-09-24')).toHaveLength(0);
    expect(cards).toHaveLength(STUDENT_COUNT);
  });

  it('scales interim grades to the weight assessed so far, so students do not look like they are failing', () => {
    const marks = buildResults(ID, people, subjects, TODAY);
    const card = d(cards[7]);
    for (const row of card.subjects) {
      const mine = marks.filter((m) => d(m).studentId === card.studentId && d(m).subjectId === row.subjectId);
      expect(mine).toHaveLength(2); // Homework 1 (15) and Quiz 1 (20)
      const raw = mine.reduce((n, m) => n + (d(m).score / d(m).maxScore) * d(m).columnWeight, 0);
      expect(row.finalGrade).toBeCloseTo(Math.round(((raw * 100) / 35) * 10) / 10, 5);
      expect(row.letterGrade).toBe(letterGrade(row.finalGrade));
    }
    const averages = cards.map((c) => d(c).studentAverage as number);
    const mean = averages.reduce((n, a) => n + a, 0) / averages.length;
    expect(mean).toBeGreaterThan(60);
    expect(mean).toBeLessThan(85);
  });

  it("equals the app's own formula once every column has marks", () => {
    const full = buildReportCards(ID, people, subjects, '2026-12-18');
    const marks = buildResults(ID, people, subjects, '2026-12-18');
    const card = d(full[11]);
    for (const row of card.subjects) {
      const mine = marks.filter((m) => d(m).studentId === card.studentId && d(m).subjectId === row.subjectId);
      expect(mine).toHaveLength(4);
      const appFormula = Math.round(mine.reduce((n, m) => n + (d(m).score / d(m).maxScore) * d(m).columnWeight, 0) * 10) / 10;
      expect(row.finalGrade).toBe(appFormula);
    }
  });

  it('ranks each class 1..n with one average, and carries the student, attendance and discipline details', () => {
    const summaries = buildAttendanceSummaries(ID, people, TODAY);
    for (const cls of CLASSES) {
      const inClass = cards.filter((c) => d(c).classId === cls.id);
      expect(inClass.map((c) => d(c).classRank as number).sort((a, b) => a - b)).toEqual(
        Array.from({ length: inClass.length }, (_, i) => i + 1),
      );
      expect(new Set(inClass.map((c) => d(c).classAverage)).size).toBe(1);
      expect(d(inClass[0]).classPopulation).toBe(inClass.length);
      const top = inClass.find((c) => d(c).classRank === 1)!;
      for (const c of inClass) expect(d(top).studentAverage).toBeGreaterThanOrEqual(d(c).studentAverage);
    }
    const card = d(cards[0]);
    const att = d(summaries.find((s) => d(s).studentId === card.studentId)!);
    expect(card.totalPossibleSessions).toBe(att.totalExpectedSessions);
    expect(card.sessionsAbsent).toBe(att.sessionsAbsent);
    expect(card.daysLate).toBe(att.daysLate);
    const disc = buildDisciplinary(ID, people, TODAY).filter((i) => d(i).studentId === card.studentId);
    expect(card.merits).toBe(disc.filter((i) => d(i).type === 'merit').length);
    expect(card.demerits).toBe(disc.filter((i) => d(i).type === 'demerit').length);
    expect(card.nextTermStart).toBe(TERMS[1].startDate);
    expect(card.gradingSystem).toBe('flat');
    expect(card.subjects.every((r: Doc) => r.cwWeight === 60 && r.examWeight === 40 && r.subjectPosition === null)).toBe(true);
  });

  it('names the lead teacher, never the assistant, on a shared subject', () => {
    const science = subjects.find((s) => s.name === 'Science')!;
    const assistant = science.assistant!;
    for (const c of cards) {
      const row = d(c).subjects.find((r: Doc) => r.subjectId === science.id);
      if (row) expect(row.teacherId).not.toBe(assistant.uid);
    }
  });

  it('has no undefined values and every path inside the demo', () => {
    for (const i of [...cards, ...buildExtras(ID, people, subjects), ...buildRubricLinks(ID, subjects, TODAY)]) {
      expect(hasUndefined(i.data), i.path).toBe(false);
      expect(isSafePath(i.path, ID), i.path).toBe(true);
    }
  });
});

describe('the second set in the script, and the activity-clearing script', () => {
  it('writes updates as updates, and report cards only after the marks, attendance and support data', () => {
    expect(script).toContain("if (item.mode === 'update') batch.update(db.doc(item.path), item.data);");
    expect(script).toContain('attendanceDone && marksDone && extrasDone');
    expect(script).toContain('cp.reportCardsThrough = through;');
  });

  it('only clears the Activity log of a demo account that belongs to the demo institution, as a dry run by default', () => {
    expect(isDemoLoginUid('bmpsspe001')).toBe(true);
    expect(isDemoLoginUid('bmpsstu001')).toBe(true);
    for (const v of ['someRealUid123', 'bmpsstu002', '', undefined, null]) expect(isDemoLoginUid(v), String(v)).toBe(false);
    expect(clear).toContain("const DEFAULT_UID = 'bmpsspe001';");
    expect(clear).toContain('if (!isDemoLoginUid(opts.uid))');
    expect(clear).toContain('userSnap.data().institutionId !== institutionId');
    expect(clear).toContain("if (arg === '--live') opts.live = true;");
    expect(clear).toContain('if (!opts.live) {');
  });

  it('deletes nothing but that account\'s activity_log entries', () => {
    expect(clear.match(/writer\.delete\(/g)).toHaveLength(1);
    expect(clear).toContain('db.collection(`users/${opts.uid}/activity_log`)');
    expect(clear).not.toContain('audit_log');
    expect(clear).not.toContain('recursiveDelete');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Review fixes: Jamaica's date, the term-status guard, the signatory correction
// ─────────────────────────────────────────────────────────────────────────

describe("today's date in Jamaica", () => {
  it('is the Jamaica date, not the UTC date: UTC-5 all year, no daylight saving', () => {
    expect(todayInJamaica(new Date('2026-10-16T01:00:00Z'))).toBe('2026-10-15'); // 8 pm on the 15th in Kingston
    expect(todayInJamaica(new Date('2026-10-15T05:00:00Z'))).toBe('2026-10-15'); // midnight in Kingston
    expect(todayInJamaica(new Date('2026-10-15T04:59:00Z'))).toBe('2026-10-14');
    expect(todayInJamaica(new Date('2027-07-01T12:00:00Z'))).toBe('2027-07-01'); // summer: still UTC-5
    expect(todayInJamaica()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is what the seed script uses for "today", and the term-status refresh waits for the static documents', () => {
    expect(script).toContain('const todayISO = todayInJamaica();');
    expect(script).not.toContain('new Date().toISOString().slice(0, 10)');
    expect(script).toContain('if (live && budget > 0 && (cp.staticWritten ?? 0) >= staticItems.length) {');
  });
});

describe('the signatory correction', () => {
  it('names the principal as the admin: Mrs. B. Henry for Beverley Henry', () => {
    expect(SCHOOL.signatory).toBe('Mrs. B. Henry');
    expect(people.admin.name).toBe('Beverley Henry');
    const initial = people.admin.firstName[0];
    expect(SCHOOL.signatory).toContain(`${initial}. ${people.admin.lastName}`);
  });

  it('patches the institution and the first progress reports in place, as updates, and nothing later', () => {
    const fix = buildSignatureFix(ID, people, TODAY);
    expect(fix).toHaveLength(1 + STUDENT_COUNT);
    expect(fix[0]).toMatchObject({ path: `institutions/${ID}`, mode: 'update' });
    for (const i of fix) {
      expect(i.mode).toBe('update');
      expect(i.data).toEqual({ authorizedSignature: { mode: 'text', text: 'Mrs. B. Henry' } });
      expect(isSafePath(i.path, ID)).toBe(true);
    }
    const reports = new Set(dated.progressReports.map((i) => i.path));
    for (const i of fix.slice(1)) expect(reports.has(i.path), i.path).toBe(true);
    // a later seed date adds no more patches: later snapshots are written with the new signatory
    expect(buildSignatureFix(ID, people, '2026-12-18')).toHaveLength(1 + STUDENT_COUNT);
    expect(SIGNATURE_PATCH_UNTIL).toBe('2026-10-15');
    // before the first snapshot exists there is only the institution to correct
    expect(buildSignatureFix(ID, people, '2026-10-01')).toHaveLength(1);
  });

  it('writes new progress reports and report cards with the corrected signatory', () => {
    for (const i of dated.progressReports.slice(0, 5)) expect(d(i).authorizedSignature.text).toBe('Mrs. B. Henry');
    expect(d(buildReportCards(ID, people, subjects, TODAY)[0]).authorizedSignature.text).toBe('Mrs. B. Henry');
  });

  it('regenerates the report cards once for the correction, by a version in the checkpoint', () => {
    expect(script).toContain('const REPORT_CARDS_VERSION = 2;');
    expect(script).toContain('cp.reportCardsThrough === through && cp.reportCardsVersion === REPORT_CARDS_VERSION');
    expect(script).toContain('cp.reportCardsVersion = REPORT_CARDS_VERSION;');
  });
});
