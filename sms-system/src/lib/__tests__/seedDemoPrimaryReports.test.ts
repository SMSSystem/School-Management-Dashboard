import { describe, expect, it } from 'vitest';
import {
  CLASSES,
  PROGRESS_SNAPSHOTS,
  buildDisciplinary,
  buildExtras,
  buildManualResults,
  buildProgressReports,
  buildReportCards,
  buildResults,
  buildRubricLinks,
  feedbackFor,
  letterGrade,
  termId,
  STUDENT_COUNT,
  TERMS,
  buildAttendanceSummaries,
  isSafePath,
} from '../../../scripts/seedDemoPrimaryLogic.mjs';
import { COMMENT_KEY } from '../commentKey';
import { ID, TODAY, people, subjects, dated, hasUndefined, Doc, d } from './seedDemoPrimaryFixture';

// The Blue Mountain Primary School demo seed, part: reports. Shared setup is in seedDemoPrimaryFixture.ts.

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
