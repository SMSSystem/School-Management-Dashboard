import { clampIndex, type SwipeDirection } from "./examCarousel";

// The arithmetic of the rubric carousel (docs/miscellaneous-specs/RUBRICS_UPLOAD_SPEC.md section 6): where a step leads,
// what the position line says and which keys move it. Pure and DOM-free. The limits of a swipe are shared with the exam
// carousel (examCarousel.swipeDirection). Unlike an exam, a rubric has no forward-only rule, but it does not wrap either.

/** "Criterion 3 of 12". */
export function criterionPositionText(index: number, total: number): string {
  return `Criterion ${clampIndex(index, total) + 1} of ${total}`;
}

/** The criterion a step leads to, or null at either end of the list. */
export function stepCriterion(
  index: number,
  total: number,
  direction: SwipeDirection,
): number | null {
  const target = clampIndex(index, total) + (direction === "next" ? 1 : -1);
  return target >= 0 && target < total ? target : null;
}

/** The step an arrow key asks for, or null for any other key. */
export function directionFromKey(key: string): SwipeDirection | null {
  if (key === "ArrowRight") return "next";
  if (key === "ArrowLeft") return "prev";
  return null;
}
