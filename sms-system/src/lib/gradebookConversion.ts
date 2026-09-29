// Gradebook conversion — standalone -> gradebook, retroactive, one-way.
// ASSIGNMENTS_FEATURE_SPEC.md §4.5 (Implementation Order step 8). One
// client-side batch: flips the assignment's own gradingMode/gradebookColumnId,
// then rewrites every already-graded student's standalone `results` doc in
// place — rescaling score against the target column's maxScore rather than
// copying it raw, since a standalone assignment's maxGrade is unrelated to
// the column's own (Gradebook's grid always reads every result under a
// column against that column's single maxScore, same invariant performSave()
// enforces in list/gradebook/index.tsx).

import { getDoc, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { AssignmentDocument } from './firebase';
import { institutionCollection, institutionDoc, institutionSubdoc } from './paths';
import { rescaleScore } from './gradebookRescale';

export type ConvertAssignmentToGradebookParams = {
  institutionId: string;
  assignment: AssignmentDocument & { id: string };
  gradebookColumnId: string;
};

export async function convertAssignmentToGradebook(params: ConvertAssignmentToGradebookParams): Promise<void> {
  const { institutionId, assignment, gradebookColumnId } = params;

  // All reads happen before any batch.update is queued below — a batch
  // can't interleave reads with its own pending writes (same discipline as
  // src/lib/grading.ts's gradeSubmission()).
  const gradebookId = `${assignment.classId}_${assignment.subjectId}_${assignment.termId}`;
  const columnSnap = await getDoc(
    institutionSubdoc(institutionId, 'gradebooks', gradebookId, 'columns', gradebookColumnId),
  );
  const columnMaxScore = (columnSnap.data()?.maxScore as number | undefined) ?? 0;
  const columnWeight = (columnSnap.data()?.columnWeight as number | undefined) ?? 0;

  const existingResultsSnap = await getDocs(
    query(institutionCollection(institutionId, 'results'), where('assignmentId', '==', assignment.id)),
  );

  const batch = writeBatch(db);

  batch.update(institutionDoc(institutionId, 'assignments', assignment.id), {
    gradingMode: 'gradebook',
    gradebookColumnId,
  });

  existingResultsSnap.docs.forEach((resultDoc) => {
    const data = resultDoc.data();
    const oldScore = (data.score as number | undefined) ?? 0;
    const oldMaxScore = (data.maxScore as number | undefined) ?? 0;
    const rescaledScore = rescaleScore(oldScore, oldMaxScore, columnMaxScore);
    batch.update(resultDoc.ref, {
      score: rescaledScore,
      maxScore: columnMaxScore,
      gradebookColumnId,
      columnWeight,
      weight: columnWeight,
      source: 'gradebook',
    });
  });

  await batch.commit();
}
