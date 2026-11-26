import type {
  RubricCriterion,
  RubricLevel,
  RubricScore,
} from "@/types/assessment";

// Scoring a submission with its assignment's rubric (RUBRICS_UPLOAD_SPEC.md section 6.14). The teacher picks a level
// for each criterion, or types points for a criterion with no levels; the total fills the grade's Score and Max
// Score, which the teacher can still change. Using the rubric is optional, but once any criterion is scored, every
// criterion must be. Scores name the criterion by id: the grid frozen at the first grade (rubricFreeze.ts). Pure.

/** The picks in the Grade dialog, by criterion id. `level` is the picked level's label; absent for typed points. */
export type RubricPicks = Record<string, { points: number; level?: string }>;

/** A grade scored with the rubric, as saved on the submission: one score per criterion, their total and the max. */
export type RubricScoring = {
  scores: RubricScore[];
  total: number;
  max: number;
};

/** A level's points as scored: never more than its criterion's max, never below 0. */
export function levelPoints(
  level: RubricLevel,
  criterion: RubricCriterion,
): number {
  return Math.max(0, Math.min(level.points, criterion.maxPoints));
}

/** Whether a level's points are over its criterion's max, so scoring it counts only the max. */
export function isCapped(
  level: RubricLevel,
  criterion: RubricCriterion,
): boolean {
  return level.points > criterion.maxPoints;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The most a submission can score on the rubric. */
export function rubricMax(criteria: RubricCriterion[]): number {
  return round2(criteria.reduce((sum, c) => sum + c.maxPoints, 0));
}

/** The points picked so far, counting only criteria in the grid. */
export function scoreTotal(
  criteria: RubricCriterion[],
  picks: RubricPicks,
): number {
  return round2(
    criteria.reduce((sum, c) => sum + (picks[c.id]?.points ?? 0), 0),
  );
}

const validPick = (c: RubricCriterion, picks: RubricPicks) => {
  const p = picks[c.id]?.points;
  return p !== undefined && Number.isFinite(p) && p >= 0 && p <= c.maxPoints;
};

/** Nothing scored, every criterion scored, or some (with the names of those still to score, or with points out of range). */
export type ScoreState =
  | { kind: "none" }
  | { kind: "complete" }
  | { kind: "partial"; missing: string[] };

export function scoreState(
  criteria: RubricCriterion[],
  picks: RubricPicks,
): ScoreState {
  if (!criteria.some((c) => picks[c.id] !== undefined)) return { kind: "none" };
  const missing = criteria
    .filter((c) => !validPick(c, picks))
    .map((c) => c.name);
  return missing.length === 0
    ? { kind: "complete" }
    : { kind: "partial", missing };
}

/** The message Save Grade shows for a part-scored rubric. */
export function partialScoreError(missing: string[]): string {
  const names = missing.slice(0, 3).join(", ");
  const more = missing.length > 3 ? ` and ${missing.length - 3} more` : "";
  return `Score every rubric criterion, or clear the rubric scores. Still to score: ${names}${more}.`;
}

/** A rubric total on the gradebook column's scale, to one decimal place: 15 of 20 on a column out of 100 is 75. */
export function scaleToColumn(
  total: number,
  max: number,
  columnMax: number,
): number {
  if (max <= 0) return 0;
  return Math.round((total / max) * columnMax * 10) / 10;
}

/**
 * What the picks put in Score and Max Score: the total out of the rubric's max, or in gradebook mode the total
 * scaled to the column, which keeps its own max.
 */
export function rubricFill(
  criteria: RubricCriterion[],
  picks: RubricPicks,
  gradebookColumnMax: number | null,
): { score: string; maxScore: string } {
  const total = scoreTotal(criteria, picks);
  const max = rubricMax(criteria);
  if (gradebookColumnMax !== null) {
    return {
      score: String(scaleToColumn(total, max, gradebookColumnMax)),
      maxScore: String(gradebookColumnMax),
    };
  }
  return { score: String(total), maxScore: String(max) };
}

/** The picks as saved on the submission, in the grid's order. */
export function scoresToSave(
  criteria: RubricCriterion[],
  picks: RubricPicks,
): RubricScore[] {
  return criteria
    .filter((c) => picks[c.id] !== undefined)
    .map((c) => {
      const { points, level } = picks[c.id];
      return { criterionId: c.id, points, ...(level ? { level } : {}) };
    });
}

/** The saved scores as picks, for a re-grade. Scores for criteria not in the grid are dropped. */
export function picksFromSaved(
  criteria: RubricCriterion[],
  saved: RubricScore[] | undefined,
): RubricPicks {
  const ids = new Set(criteria.map((c) => c.id));
  const picks: RubricPicks = {};
  for (const s of saved ?? []) {
    if (ids.has(s.criterionId)) {
      picks[s.criterionId] = {
        points: s.points,
        ...(s.level ? { level: s.level } : {}),
      };
    }
  }
  return picks;
}

/** Whether a level is the one awarded: by its label, or by its points when the score has no label. */
export function isAwarded(
  level: RubricLevel,
  criterion: RubricCriterion,
  score: RubricScore | undefined,
): boolean {
  if (!score) return false;
  return score.level !== undefined
    ? score.level === level.label
    : levelPoints(level, criterion) === score.points;
}
