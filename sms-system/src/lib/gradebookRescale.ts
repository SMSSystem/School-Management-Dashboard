// Pure rescaling math for gradebook conversion — split out of
// gradebookConversion.ts (which otherwise pulls in ./firebase's app/App
// Check/persistent-cache initialization, unsafe to import in a Node test
// environment: `self` isn't defined there) so this can be unit-tested in
// isolation, mirroring gradeEntryTracking.ts/reportBuilder.ts/
// reportCardUtils.ts's own "pure and Firestore-free... unit-tested in
// isolation" convention.
//
// ASSIGNMENTS_FEATURE_SPEC.md §4.5: a standalone-graded assignment's own
// maxGrade is unrelated to the target gradebook column's maxScore, so
// converting must rescale each score proportionally rather than copy it
// raw — a straight copy would silently corrupt the percentage Gradebook's
// grid displays and feeds into the class average.

// Guards oldMaxScore <= 0 (shouldn't happen for a real result, whose own
// write path enforces score <= maxScore, but a straight division would
// otherwise produce NaN, which firestore.rules' score <= maxScore check
// would then reject outright).
export function rescaleScore(oldScore: number, oldMaxScore: number, columnMaxScore: number): number {
  return oldMaxScore > 0 ? (oldScore / oldMaxScore) * columnMaxScore : 0;
}
