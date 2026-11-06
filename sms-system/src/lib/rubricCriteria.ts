import type { RubricCriterion, RubricLevel } from "@/types/assessment";

// A rubric's criteria as the editor makes and checks them, shared by the form and the review of a grid read from a file, so the
// two can't disagree (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 7.3). Pure.

export const newLevel = (): RubricLevel => ({
  label: "",
  points: 0,
  description: "",
});

export const newCriterion = (): RubricCriterion => ({
  id: crypto.randomUUID(),
  name: "",
  maxPoints: 0,
  levels: [newLevel()],
});

function levelProblem(level: RubricLevel, name: string): string | null {
  if (!level.label.trim())
    return `Every performance level under "${name}" needs a label.`;
  return level.points < 0
    ? `Performance level points under "${name}" cannot be negative.`
    : null;
}

function criterionProblem(c: RubricCriterion): string | null {
  if (!c.name.trim()) return "Every criterion needs a name.";
  if (!(c.maxPoints > 0))
    return `"${c.name || "Untitled criterion"}" needs a max points value greater than 0.`;
  if (c.levels.length === 0)
    return `"${c.name}" needs at least one performance level.`;
  for (const level of c.levels) {
    const problem = levelProblem(level, c.name);
    if (problem) return problem;
  }
  return null;
}

/**
 * What is wrong with a grid, or null when it may be saved. A rubric that holds a file may have no grid at all. Checked on submit
 * rather than per keystroke, as the form's other fields are.
 */
export function validateCriteria(
  criteria: readonly RubricCriterion[],
  hasFile: boolean,
): string | null {
  if (criteria.length === 0)
    return hasFile ? null : "At least one criterion is required.";
  for (const c of criteria) {
    const problem = criterionProblem(c);
    if (problem) return problem;
  }
  return null;
}
