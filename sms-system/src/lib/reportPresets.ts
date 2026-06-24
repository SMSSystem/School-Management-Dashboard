import type { ReportConfig } from './reportBuilder';

/**
 * Standing-report library (v1).
 *
 * Each preset is just a pre-filled ReportConfig — there is no per-report code.
 * Selecting one loads its config into the builder, which the user can then
 * tweak (population, thresholds, columns) before running.
 *
 * Thresholds use the same bands as the report-card grading engine
 * (reportCardUtils.letterGrade): pass mark = 40, A- = 80, A = 85.
 *
 * NOTE (client follow-up): the exact standing-report list, score bands, and
 * percentage semantics were not supplied by the client. These are the
 * conventional school-MIS defaults and are expected to be tuned later.
 */
export type ReportPreset = {
  id: string;
  label: string;
  description: string;
  /** Config is loaded into the builder; population is left for the user to scope. */
  config: ReportConfig;
  /** When true, the user must pick a subject before running. */
  requiresSubject?: boolean;
};

export const REPORT_PRESETS: ReportPreset[] = [
  {
    id: 'honour-roll',
    label: 'Honour Roll',
    description: 'Students with a term average of 80 or above.',
    config: {
      name: 'Honour Roll',
      population: { type: 'institution' },
      conditions: [{ metric: 'average', operator: 'gte', value: 80 }],
      output: 'list',
      columns: ['studentName', 'className', 'gradeLevel', 'studentAverage', 'gpa'],
      sortBy: 'studentAverage',
      sortDir: 'desc',
    },
  },
  {
    id: 'principals-list',
    label: "Principal's List (Distinction)",
    description: 'Students with a term average of 85 or above.',
    config: {
      name: "Principal's List",
      population: { type: 'institution' },
      conditions: [{ metric: 'average', operator: 'gte', value: 85 }],
      output: 'list',
      columns: ['studentName', 'className', 'gradeLevel', 'studentAverage', 'gpa'],
      sortBy: 'studentAverage',
      sortDir: 'desc',
    },
  },
  {
    id: 'at-risk',
    label: 'At-Risk / Failing',
    description: 'Students whose term average is below the pass mark of 40.',
    config: {
      name: 'At-Risk / Failing',
      population: { type: 'institution' },
      conditions: [{ metric: 'average', operator: 'lt', value: 40 }],
      output: 'list',
      columns: ['studentName', 'className', 'gradeLevel', 'studentAverage'],
      sortBy: 'studentAverage',
      sortDir: 'asc',
    },
  },
  {
    id: 'subject-pass-rate',
    label: 'Subject Pass Rate',
    description: 'Percentage of the population scoring 40 or above in a chosen subject.',
    requiresSubject: true,
    config: {
      name: 'Subject Pass Rate',
      population: { type: 'institution' },
      conditions: [{ metric: 'subjectScore', operator: 'gte', value: 40 }],
      output: 'percentage',
      columns: ['studentName', 'className', 'subject'],
    },
  },
  {
    id: 'top-of-class',
    label: 'Top of Class / Grade',
    description: 'Students ranked by term average (scope to a class or grade first).',
    config: {
      name: 'Top of Class / Grade',
      population: { type: 'institution' },
      conditions: [],
      output: 'list',
      columns: ['studentName', 'className', 'gradeLevel', 'studentAverage', 'classRank'],
      sortBy: 'studentAverage',
      sortDir: 'desc',
    },
  },
  {
    id: 'attendance-concern',
    label: 'Attendance Concern',
    description: 'Students with an attendance rate below 90%.',
    config: {
      name: 'Attendance Concern',
      population: { type: 'institution' },
      conditions: [{ metric: 'attendanceRate', operator: 'lt', value: 90 }],
      output: 'list',
      columns: ['studentName', 'className', 'attendance'],
      sortBy: 'attendance',
      sortDir: 'asc',
    },
  },
];
