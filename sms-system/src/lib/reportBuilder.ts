import type { ReportCardDocument } from './firebase';
import type { LetterGrade } from './reportCardUtils';

/**
 * Report Builder — pure query/aggregation engine.
 *
 * v1 reads from generated `reportCards` documents (the snapshot produced by
 * generateReportCard.ts), so it reuses the grading engine's output and stays
 * consistent with printed cards. It does NOT re-derive grades from raw results.
 *
 * Everything in this module is pure and Firestore-free so it can be unit-tested
 * in isolation (mirrors reportCardUtils.ts). The scene fetches the cards,
 * enriches each with its numeric grade level (a `classes` join), and passes the
 * resulting BuilderCard[] in.
 */

/** A report card enriched with the fields the builder needs that the doc lacks. */
export type BuilderCard = ReportCardDocument & {
  id: string;
  /** Numeric grade level, joined from classes.grade; null when unknown. */
  gradeLevel: number | null;
};

// ── Population (the WHO) ───────────────────────────────────────────────────────

export type PopulationType = 'institution' | 'class' | 'grade' | 'cohort' | 'house';

export type Population = {
  type: PopulationType;
  classId?: string;
  grade?: number;
  academicYearId?: string;
  houseId?: string;
};

// ── Conditions (the FILTER) ─────────────────────────────────────────────────────

/** Numeric metrics compare with gte/lte/between; the two letter/code metrics use `in`. */
export type Metric =
  | 'average'
  | 'gpa'
  | 'classRank'
  | 'attendanceRate'
  | 'subjectScore'
  | 'subjectLetter'
  | 'conduct';

export type Operator =
  | 'gte'
  | 'gt'
  | 'lte'
  | 'lt'
  | 'between'
  | 'eq'
  | 'in'
  | 'topN'
  | 'bottomN';

export type Condition = {
  metric: Metric;
  operator: Operator;
  /** Numeric bound for gte/gt/lte/lt/eq, or N for topN/bottomN, or lower bound for between. */
  value?: number;
  /** Upper bound for `between`. */
  value2?: number;
  /** String set for `in` metrics (letter grades, conduct codes). */
  values?: string[];
  /** Required for subjectScore / subjectLetter. */
  subjectId?: string;
};

// ── Output + columns (the SHAPE / the WHAT) ────────────────────────────────────

export type OutputType = 'list' | 'percentage';

export type ColumnKey =
  | 'studentName'
  | 'institutionStudentId'
  | 'className'
  | 'gradeLevel'
  | 'houseName'
  | 'dateOfBirth'
  | 'studentAverage'
  | 'gpa'
  | 'classRank'
  | 'attendance'
  | 'subject';

export const COLUMN_LABELS: Record<ColumnKey, string> = {
  studentName: 'Student',
  institutionStudentId: 'Student ID',
  className: 'Class',
  gradeLevel: 'Grade',
  houseName: 'House',
  dateOfBirth: 'DOB',
  studentAverage: 'Average',
  gpa: 'GPA',
  classRank: 'Position',
  attendance: 'Attendance',
  subject: 'Subject',
};

/** Columns whose values are numeric (used for sorting and right-alignment). */
const NUMERIC_COLUMNS: ReadonlySet<ColumnKey> = new Set<ColumnKey>([
  'gradeLevel',
  'studentAverage',
  'gpa',
  'classRank',
  'attendance',
]);

export function isNumericColumn(key: ColumnKey): boolean {
  return NUMERIC_COLUMNS.has(key);
}

export type ReportConfig = {
  name: string;
  population: Population;
  conditions: Condition[];
  output: OutputType;
  columns: ColumnKey[];
  /** When set, conditions/columns can reference this subject's row. */
  focusSubjectId?: string;
  focusSubjectName?: string;
  sortBy?: ColumnKey;
  sortDir?: 'asc' | 'desc';
};

export type ReportResult = {
  /** Cards that passed the population filter AND every condition, sorted. */
  matched: BuilderCard[];
  /** Population size after the population filter, before conditions. */
  total: number;
  matchedCount: number;
  /** matchedCount / total * 100; null when the population is empty. */
  percentage: number | null;
};

// ── Metric extraction ──────────────────────────────────────────────────────────

/** Attendance rate as a 0–100 percentage; null when no sessions are recorded. */
export function attendanceRate(card: BuilderCard): number | null {
  const total = card.totalPossibleSessions;
  if (!total || total <= 0) return null;
  return ((total - card.sessionsAbsent) / total) * 100;
}

function subjectRow(card: BuilderCard, subjectId?: string) {
  if (!subjectId) return undefined;
  return card.subjects.find((s) => s.subjectId === subjectId);
}

/** Numeric value for a numeric metric; null when absent/unavailable. */
function numericMetric(card: BuilderCard, metric: Metric, subjectId?: string): number | null {
  switch (metric) {
    case 'average':
      return card.studentAverage;
    case 'gpa':
      return card.gpa;
    case 'classRank':
      return card.classRank;
    case 'attendanceRate':
      return attendanceRate(card);
    case 'subjectScore':
      return subjectRow(card, subjectId)?.finalGrade ?? null;
    default:
      return null;
  }
}

// ── Population filter ───────────────────────────────────────────────────────────

export function filterPopulation(cards: BuilderCard[], pop: Population): BuilderCard[] {
  switch (pop.type) {
    case 'class':
      return pop.classId ? cards.filter((c) => c.classId === pop.classId) : [];
    case 'grade':
      return pop.grade != null ? cards.filter((c) => c.gradeLevel === pop.grade) : [];
    case 'cohort':
      return pop.academicYearId
        ? cards.filter((c) => c.academicYearId === pop.academicYearId)
        : [];
    case 'house':
      return pop.houseId ? cards.filter((c) => c.houseId === pop.houseId) : [];
    case 'institution':
    default:
      return cards;
  }
}

// ── Condition predicates ────────────────────────────────────────────────────────

/**
 * Builds a per-card predicate for one condition. Some operators (topN/bottomN)
 * are population-relative, so the population is passed in to precompute the
 * qualifying set once.
 */
function buildPredicate(
  population: BuilderCard[],
  cond: Condition,
): (card: BuilderCard) => boolean {
  // Population-relative ranking operators.
  if (cond.operator === 'topN' || cond.operator === 'bottomN') {
    const n = cond.value ?? 0;
    const ranked = population
      .map((c) => ({ id: c.id, v: numericMetric(c, cond.metric, cond.subjectId) }))
      .filter((x): x is { id: string; v: number } => x.v !== null)
      .sort((a, b) => (cond.operator === 'topN' ? b.v - a.v : a.v - b.v))
      .slice(0, Math.max(0, n));
    const set = new Set(ranked.map((x) => x.id));
    return (card) => set.has(card.id);
  }

  // Conduct: matches when ANY subject row's conduct grade is in the chosen set.
  if (cond.metric === 'conduct') {
    const allowed = new Set(cond.values ?? []);
    return (card) =>
      card.subjects.some((s) => s.conductGrade != null && allowed.has(s.conductGrade));
  }

  // Subject letter grade membership.
  if (cond.metric === 'subjectLetter') {
    const allowed = new Set(cond.values ?? []);
    return (card) => {
      const row = subjectRow(card, cond.subjectId);
      return row != null && allowed.has(row.letterGrade);
    };
  }

  // Numeric metrics.
  return (card) => {
    const v = numericMetric(card, cond.metric, cond.subjectId);
    if (v === null) return false;
    switch (cond.operator) {
      case 'gte':
        return v >= (cond.value ?? -Infinity);
      case 'gt':
        return v > (cond.value ?? -Infinity);
      case 'lte':
        return v <= (cond.value ?? Infinity);
      case 'lt':
        return v < (cond.value ?? Infinity);
      case 'between':
        return v >= (cond.value ?? -Infinity) && v <= (cond.value2 ?? Infinity);
      case 'eq':
        return v === cond.value;
      default:
        return false;
    }
  };
}

// ── Sorting + projection ────────────────────────────────────────────────────────

/** Numeric value backing a column for sorting; null sorts last. */
function columnSortValue(card: BuilderCard, key: ColumnKey): number | string | null {
  switch (key) {
    case 'gradeLevel':
      return card.gradeLevel;
    case 'studentAverage':
      return card.studentAverage;
    case 'gpa':
      return card.gpa;
    case 'classRank':
      return card.classRank;
    case 'attendance':
      return attendanceRate(card);
    case 'subject':
      return null;
    default:
      return columnValue(card, key);
  }
}

function sortCards(cards: BuilderCard[], key: ColumnKey, dir: 'asc' | 'desc'): BuilderCard[] {
  const factor = dir === 'asc' ? 1 : -1;
  return [...cards].sort((a, b) => {
    const av = columnSortValue(a, key);
    const bv = columnSortValue(b, key);
    if (av === null && bv === null) return 0;
    if (av === null) return 1; // nulls last regardless of direction
    if (bv === null) return -1;
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * factor;
    return String(av).localeCompare(String(bv)) * factor;
  });
}

/** Display string for a column. `focusSubjectId` drives the `subject` column. */
export function columnValue(card: BuilderCard, key: ColumnKey, focusSubjectId?: string): string {
  switch (key) {
    case 'studentName':
      return card.studentName || '—';
    case 'institutionStudentId':
      return card.institutionStudentId ?? '—';
    case 'className':
      return card.className || '—';
    case 'gradeLevel':
      return card.gradeLevel != null ? String(card.gradeLevel) : '—';
    case 'houseName':
      return card.houseName ?? '—';
    case 'dateOfBirth':
      return card.dateOfBirth ?? '—';
    case 'studentAverage':
      return card.studentAverage != null ? card.studentAverage.toFixed(1) : '—';
    case 'gpa':
      return card.gpa != null ? card.gpa.toFixed(2) : '—';
    case 'classRank':
      return card.classRank != null ? String(card.classRank) : '—';
    case 'attendance': {
      const r = attendanceRate(card);
      return r != null ? `${r.toFixed(0)}%` : '—';
    }
    case 'subject': {
      const row = subjectRow(card, focusSubjectId);
      return row ? `${row.finalGrade.toFixed(1)} (${row.letterGrade})` : '—';
    }
    default:
      return '—';
  }
}

// ── Entry point ─────────────────────────────────────────────────────────────────

export function runReport(cards: BuilderCard[], config: ReportConfig): ReportResult {
  const population = filterPopulation(cards, config.population);
  const predicates = config.conditions.map((c) => buildPredicate(population, c));
  let matched = population.filter((card) => predicates.every((p) => p(card)));
  if (config.sortBy) {
    matched = sortCards(matched, config.sortBy, config.sortDir ?? 'desc');
  }
  return {
    matched,
    total: population.length,
    matchedCount: matched.length,
    percentage: population.length > 0 ? (matched.length / population.length) * 100 : null,
  };
}

/** Letter grades available to subjectLetter conditions, ordered high → low. */
export const LETTER_GRADES: readonly LetterGrade[] = [
  'A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'E',
] as const;

/** Conduct codes available to conduct conditions (matches feedback_comments). */
export const CONDUCT_CODES: readonly string[] = ['G', 'S', 'F', 'U', 'P', 'D'] as const;
