// Teacher grading write flow — ASSIGNMENTS_FEATURE_SPEC.md §4.3
// (Implementation Order step 6). One client-side batch per grade entry:
// the SubmissionDocument's grade fields, the SubmissionTombstoneDocument's
// wasGraded flip, and a `results` write — mirroring list/gradebook/index.tsx's
// own performSave() exactly when gradingMode === 'gradebook', or a plain
// coursework result (picked up automatically by generateReportCard.ts's
// computeCWGrade() path) when 'standalone'.

import { doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import type { AssignmentDocument } from './firebase';
import { institutionCollection, institutionDoc, institutionSubdoc } from './paths';
import { rubricToFreeze } from './rubricFreeze';
import type { RubricCriterion } from '@/types/assessment';

export type GradeSubmissionParams = {
  institutionId: string;
  assignment: AssignmentDocument & { id: string };
  studentId: string;
  studentName: string;
  score: number;
  maxScore: number;
  feedback?: string;
  graderId: string;
  graderName: string;
  // The rubric the page shows, so the first grade can freeze its grid on the assignment (rubricFreeze.ts).
  rubric?: { title?: string; description?: string; criteria?: RubricCriterion[] } | null;
};

export async function gradeSubmission(params: GradeSubmissionParams): Promise<void> {
  const {
    institutionId,
    assignment,
    studentId,
    studentName,
    score,
    maxScore,
    feedback,
    graderId,
    graderName,
    rubric,
  } = params;

  const baseResultFields = {
    studentId,
    studentName,
    classId: assignment.classId,
    className: assignment.className,
    termId: assignment.termId,
    institutionId,
    subjectId: assignment.subjectId,
    assessmentName: assignment.title ?? assignment.subjectName,
    assessmentType: 'coursework' as const,
    score,
    maxScore,
    teacherId: graderId,
    teacherName: graderName,
    departmentId: assignment.departmentId ?? '',
    assignmentId: assignment.id,
  };

  // All reads happen before any batch.set/update is queued below — a batch
  // can't interleave reads with its own pending writes.
  let existingResultId: string | null;
  let gradebookExtraFields: { weight: number; columnWeight: number; gradebookColumnId: string; source: 'gradebook' } | null = null;

  if (assignment.gradingMode === 'gradebook' && assignment.gradebookColumnId) {
    const gradebookId = `${assignment.classId}_${assignment.subjectId}_${assignment.termId}`;
    const columnSnap = await getDoc(
      institutionSubdoc(institutionId, 'gradebooks', gradebookId, 'columns', assignment.gradebookColumnId),
    );
    const columnWeight = (columnSnap.data()?.columnWeight as number | undefined) ?? 0;
    gradebookExtraFields = {
      weight: columnWeight,
      columnWeight,
      gradebookColumnId: assignment.gradebookColumnId,
      source: 'gradebook',
    };

    const existingSnap = await getDocs(
      query(
        institutionCollection(institutionId, 'results'),
        where('gradebookColumnId', '==', assignment.gradebookColumnId),
        where('studentId', '==', studentId),
      ),
    );
    existingResultId = existingSnap.empty ? null : existingSnap.docs[0].id;
  } else {
    const existingSnap = await getDocs(
      query(
        institutionCollection(institutionId, 'results'),
        where('assignmentId', '==', assignment.id),
        where('studentId', '==', studentId),
      ),
    );
    existingResultId = existingSnap.empty ? null : existingSnap.docs[0].id;
  }

  const resultFields = gradebookExtraFields
    ? { ...baseResultFields, ...gradebookExtraFields }
    : baseResultFields;

  const batch = writeBatch(db);

  batch.update(institutionSubdoc(institutionId, 'assignments', assignment.id, 'submissions', studentId), {
    grade: score,
    maxGrade: maxScore,
    ...(feedback ? { feedback } : {}),
    gradedBy: graderId,
    gradedByName: graderName,
    gradedAt: serverTimestamp(),
    status: 'graded',
  });

  batch.update(
    institutionSubdoc(institutionId, 'assignments', assignment.id, 'submissionTombstones', studentId),
    { wasGraded: true },
  );

  // The first grade keeps the rubric's grid on the assignment, in the same batch, so later edits to the shared
  // rubric don't change how this work was marked (firestore.rules allows adding it once).
  const freeze = rubricToFreeze(assignment, rubric);
  if (freeze) {
    batch.update(institutionDoc(institutionId, 'assignments', assignment.id), {
      rubricFrozen: { ...freeze, frozenAt: serverTimestamp() },
    });
  }

  if (existingResultId) {
    batch.update(institutionDoc(institutionId, 'results', existingResultId), resultFields);
  } else {
    batch.set(doc(institutionCollection(institutionId, 'results')), {
      ...resultFields,
      createdAt: serverTimestamp(),
    });
  }

  await batch.commit();
}
