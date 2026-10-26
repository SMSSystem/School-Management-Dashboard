import {
  EXAM_INTEGRITY_DEFAULT,
  type ExamActivityEvent,
  type ExamIntegrityPreset,
  type ExamIntegritySummary,
  type ExamQuestion,
  type ExamQuestionStat,
  type ExamSubmitReason,
} from '@/types/exams';
import { summarizeActivity } from './examActivity';
import { classStats, difficultyPercent, type ClassStats } from './examStats';
import { gradeNeedsRegrade, isReleased } from './examRelease';
import { naturalCompare } from './sortByName';
import type { ExportColumn } from './spreadsheetExport';

// The rows, counts and figures of the staff results screen (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.7, §6.6
// and §9). Pure and Firebase-free: the screen passes in the class roster, the grades, the accommodations and, only when
// it has read them, the attempts.

export type RosterStudent = { uid: string; name: string };

export type GradeForRow = {
  studentId: string;
  studentName: string;
  score: number;
  maxScore: number;
  method: 'auto' | 'manual';
  gradedByName: string;
  keyRevision: number;
  releaseAtMs: number | null;
  resultSynced: boolean;
  tabSwitches?: number;
  /** The activity summary and compact timeline copied from the attempt when it was graded. */
  integrity?: ExamIntegritySummary;
  submittedAtMs?: number | null;
  submitReason?: ExamSubmitReason;
  manualReason?: string;
  comment?: string;
};

export type AttemptForRow = {
  studentId: string;
  studentName: string;
  status: 'in_progress' | 'submitted';
  tabSwitches: number;
  extraMinutes: number;
  submitReason?: ExamSubmitReason;
  events?: readonly ExamActivityEvent[];
  answeredAt?: Readonly<Record<string, number>>;
};

export type ResultStatus =
  | 'Not started'
  | 'In progress'
  | 'Submitted'
  | 'Expired'
  | 'Graded'
  | 'Re-grade needed'
  | 'Released';

export type ResultRow = {
  studentId: string;
  name: string;
  status: ResultStatus;
  hasGrade: boolean;
  /** The grade came from an attempt in the app (it carries a submit time or reason). */
  fromAttempt: boolean;
  released: boolean;
  needsRegrade: boolean;
  score: number | null;
  maxScore: number;
  percent: number | null;
  tabSwitches: number | null;
  /** The activity summary: from the grade, else from the attempt when it was read; null without a log (an exam sat before it existed). */
  integrity: ExamIntegritySummary | null;
  extraMinutes: number;
  gradedByName: string;
  method: 'auto' | 'manual' | null;
  manualReason: string;
  comment: string;
};

/**
 * One row per student: everyone in the class, plus anyone who has a grade or an attempt and is no longer in it. A
 * graded student shows from the grade (so the screen needs no attempt for them); otherwise the attempt, when it was
 * read, says whether they are in progress, submitted or expired; with neither they have not started.
 */
/** The activity summary of one attempt, for the Review mark: the exam's length (and the student's extra time) and preset decide it. */
function summaryOfAttempt(a: AttemptForRow, exam: { durationMinutes: number; preset: ExamIntegrityPreset }, extraMinutes: number): ExamIntegritySummary | null {
  if (a.events === undefined) return null;
  return summarizeActivity({
    events: a.events,
    answeredAt: a.answeredAt,
    tabSwitches: a.tabSwitches,
    durationSeconds: (exam.durationMinutes + extraMinutes) * 60,
    preset: exam.preset,
  });
}

export function buildResultRows(input: {
  roster: readonly RosterStudent[];
  grades: readonly GradeForRow[];
  attempts: readonly AttemptForRow[] | null;
  accommodations: Readonly<Record<string, number>>;
  maxScore: number;
  keyRevision: number;
  nowMs: number;
  /** The exam's length in minutes and its integrity preset (absent means supervised); the Review mark depends on them. */
  exam?: { durationMinutes: number; preset?: ExamIntegrityPreset };
}): ResultRow[] {
  const examInfo = { durationMinutes: input.exam?.durationMinutes ?? 0, preset: input.exam?.preset ?? EXAM_INTEGRITY_DEFAULT };
  const gradeBy = new Map(input.grades.map((g) => [g.studentId, g]));
  const attemptBy = new Map((input.attempts ?? []).map((a) => [a.studentId, a]));
  const people = new Map<string, string>();
  for (const s of input.roster) people.set(s.uid, s.name);
  for (const g of input.grades) if (!people.has(g.studentId)) people.set(g.studentId, g.studentName);
  for (const a of input.attempts ?? []) if (!people.has(a.studentId)) people.set(a.studentId, a.studentName);

  const rows = [...people].map(([uid, name]): ResultRow => {
    const grade = gradeBy.get(uid);
    const attempt = attemptBy.get(uid);
    const extraMinutes = input.accommodations[uid] ?? attempt?.extraMinutes ?? 0;
    if (grade) {
      const released = isReleased(grade.releaseAtMs, input.nowMs);
      const needsRegrade = gradeNeedsRegrade(grade, input.keyRevision);
      return {
        studentId: uid,
        name,
        status: needsRegrade ? 'Re-grade needed' : released ? 'Released' : 'Graded',
        hasGrade: true,
        fromAttempt: grade.submittedAtMs !== undefined || grade.submitReason !== undefined,
        released,
        needsRegrade,
        score: grade.score,
        maxScore: grade.maxScore,
        percent: grade.maxScore > 0 ? Math.round((grade.score / grade.maxScore) * 100) : null,
        tabSwitches: grade.tabSwitches ?? attempt?.tabSwitches ?? null,
        integrity: grade.integrity ?? (attempt ? summaryOfAttempt(attempt, examInfo, extraMinutes) : null),
        extraMinutes,
        gradedByName: grade.gradedByName,
        method: grade.method,
        manualReason: grade.manualReason ?? '',
        comment: grade.comment ?? '',
      };
    }
    const status: ResultStatus = !attempt
      ? 'Not started'
      : attempt.status === 'in_progress'
        ? 'In progress'
        : attempt.submitReason === 'expired'
          ? 'Expired'
          : 'Submitted';
    return {
      studentId: uid,
      name,
      status,
      hasGrade: false,
      fromAttempt: !!attempt,
      released: false,
      needsRegrade: false,
      score: null,
      maxScore: input.maxScore,
      percent: null,
      tabSwitches: attempt?.tabSwitches ?? null,
      integrity: attempt ? summaryOfAttempt(attempt, examInfo, extraMinutes) : null,
      extraMinutes,
      gradedByName: '',
      method: null,
      manualReason: '',
      comment: '',
    };
  });
  return rows.sort((a, b) => naturalCompare(a.name, b.name));
}

export type ResultCounts = {
  /** Students who have an attempt (the aggregate count when the attempts were not read). */
  started: number;
  submitted: number;
  graded: number;
  released: number;
  needsRegrade: number;
  /** Submitted or expired attempts with no grade yet. */
  ungraded: number;
};

export function resultCounts(rows: readonly ResultRow[], attemptCount: number): ResultCounts {
  const fromAttempt = rows.filter((r) => r.fromAttempt).length;
  return {
    started: Math.max(attemptCount, fromAttempt),
    submitted: rows.filter((r) => r.fromAttempt && r.status !== 'In progress').length,
    graded: rows.filter((r) => r.hasGrade).length,
    released: rows.filter((r) => r.released).length,
    needsRegrade: rows.filter((r) => r.needsRegrade).length,
    ungraded: rows.filter((r) => !r.hasGrade && (r.status === 'Submitted' || r.status === 'Expired')).length,
  };
}

/**
 * Must the screen read the attempts? Not while every attempt has been graded and no grade is out of date: the grades
 * already say everything the table shows. `attemptCount` is an aggregate count (one read), `gradedFromAttempt` the
 * grades that came from an attempt.
 */
export function needsAttemptRead(input: { attemptCount: number; gradedFromAttempt: number; needsRegrade: number }): boolean {
  return input.attemptCount > input.gradedFromAttempt || input.needsRegrade > 0;
}

/**
 * The results data with one student's grade and extra time replaced by what was just read, so a save of one score does
 * not mean reading the whole screen again. A null grade removes it; a null extra time removes the entry.
 */
export function applyStudentRecord<D extends { grades: GradeForRow[]; accommodations: Record<string, number> }>(
  data: D,
  studentId: string,
  record: { grade: GradeForRow | null; extraMinutes: number | null },
): D {
  const others = data.grades.filter((g) => g.studentId !== studentId);
  const accommodations = { ...data.accommodations };
  if (record.extraMinutes === null) delete accommodations[studentId];
  else accommodations[studentId] = record.extraMinutes;
  return { ...data, grades: record.grade ? [...others, record.grade] : others, accommodations };
}

/** Count, average, lowest and highest score of the graded students. */
export function scoreStats(rows: readonly ResultRow[]): ClassStats {
  return classStats(rows.flatMap((r) => (r.score === null ? [] : [r.score])));
}

export type DifficultyRow = { questionId: string; number: number; text: string; answered: number; correct: number; percent: number | null };

const SNIPPET = 90;

/** Per-question difficulty: how many answered it and how many got it exactly right. */
export function difficultyRows(questions: readonly ExamQuestion[], stats: Readonly<Record<string, ExamQuestionStat>>): DifficultyRow[] {
  return questions.map((q, i) => {
    const stat = stats[q.id];
    const text = q.text.trim();
    return {
      questionId: q.id,
      number: i + 1,
      text: text.length > SNIPPET ? `${text.slice(0, SNIPPET - 1)}…` : text,
      answered: stat?.answered ?? 0,
      correct: stat?.correct ?? 0,
      percent: difficultyPercent(stat),
    };
  });
}

/** The CSV columns of the results table (a leading `=`, `+`, `-` or `@` in a name is kept as text by the exporter). */
export const resultCsvColumns: ExportColumn<ResultRow>[] = [
  { header: 'Student', accessor: (r) => r.name },
  { header: 'Status', accessor: (r) => r.status },
  { header: 'Score', accessor: (r) => r.score },
  { header: 'Out of', accessor: (r) => r.maxScore },
  { header: 'Percentage', accessor: (r) => r.percent },
  { header: 'Tab switches', accessor: (r) => r.tabSwitches },
  { header: 'Time away (seconds)', accessor: (r) => r.integrity?.awaySeconds ?? null },
  { header: 'Longest time away (seconds)', accessor: (r) => r.integrity?.longestAwaySeconds ?? null },
  { header: 'Review', accessor: (r) => (r.integrity ? (r.integrity.review ? 'Yes' : 'No') : null) },
  { header: 'Extra minutes', accessor: (r) => r.extraMinutes },
  { header: 'Graded by', accessor: (r) => r.gradedByName },
  { header: 'Method', accessor: (r) => r.method },
];

/** A file name for the CSV: the exam title (or subject), safe for any file system. */
export function resultsFileName(title: string): string {
  const base = title.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 60);
  return `${base || 'exam'}-results.csv`;
}

/**
 * A plain count of the writes still to come, for the line under the counts: each score to grade or re-grade is a grade
 * and a results entry, each score the Release button will release is a grade update and a results entry.
 */
export function writesLeft(input: { toGrade: number; toRelease: number; toSync: number }): number {
  return input.toGrade * 2 + input.toRelease * 2 + input.toSync * 2;
}
