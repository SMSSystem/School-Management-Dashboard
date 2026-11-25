import type {
  FrozenRubric,
  RubricCriterion,
  RubricDocument,
} from "@/types/assessment";

// Freezing an assignment's rubric (RUBRICS_UPLOAD_SPEC.md section 13.3): the first grade saves the rubric's grid on
// the assignment, so later edits to the shared rubric, or deleting it, don't change how graded work was marked. Only a
// rubric with a grid is frozen: a file-only rubric has nothing to score, and stays linked to the shared rubric. Pure.

type LiveRubric = {
  title?: string;
  description?: string;
  criteria?: RubricCriterion[];
};

/**
 * What to freeze on the assignment at this grade, or null: nothing when it has no rubric, is already frozen, the rubric
 * isn't loaded (deleted, or not read yet), or the rubric has no grid.
 */
export function rubricToFreeze(
  assignment: { rubricId?: string; rubricFrozen?: unknown },
  live: LiveRubric | null | undefined,
): Omit<FrozenRubric, "frozenAt"> | null {
  if (!assignment.rubricId || assignment.rubricFrozen || !live) return null;
  const criteria = live.criteria ?? [];
  if (criteria.length === 0) return null;
  return {
    rubricId: assignment.rubricId,
    title: live.title ?? "Untitled rubric",
    ...(live.description ? { description: live.description } : {}),
    criteria,
  };
}

/** The frozen grid as the assignment page shows a rubric: a grid with no stored file. */
export function rubricFromFrozen(
  frozen: FrozenRubric,
  institutionId: string,
): RubricDocument & { id: string } {
  return {
    id: frozen.rubricId,
    institutionId,
    title: frozen.title,
    ...(frozen.description ? { description: frozen.description } : {}),
    criteria: frozen.criteria,
    createdBy: "",
    createdByRole: "regular_teacher",
    createdAt: frozen.frozenAt,
  };
}

/** The line the assignment page shows under a frozen rubric. */
export function frozenRubricNote(
  frozenAt: { toDate?: () => Date } | undefined,
): string {
  const date = frozenAt?.toDate?.();
  const when = date
    ? ` on ${date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`
    : "";
  return `This is the rubric as it was when grading started${when}. Later changes to the shared rubric don't change it.`;
}
