import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { GradebookColumnDocument } from '@/types/assessment';
import type { Role } from '@/types/people';
import {
  actorName,
  buildAuditEntry,
  fitsInBatch,
  logAuditEvent,
  staffFallback,
  type AuditEventInput,
} from '@/lib/auditLog';
import {
  gradebookColumnDeleteDetail,
  gradebookCommentsDetail,
  gradebookSaveDetail,
} from '@/lib/teacherAudit';
import {
  institutionCollection,
  institutionDoc,
  institutionSubcollection,
  institutionSubdoc,
} from '@/lib/paths';
import { readClassSubjects, takesSubject } from '@/lib/studentClasses';
import { leadTeacher } from '@/lib/subjectTeachers';
import type {
  ColumnDoc,
  DirtyScores,
  FeedbackDoc,
  ResultDoc,
  StudentDoc,
  SubjectDoc,
} from '@/lib/gradebookLogic';

// The Gradebook page's work against Firestore (scenes/(dashboard)/list/gradebook): loading a gradebook,
// saving its unsaved changes in one batch, and deleting a column. The page keeps every piece of screen
// state and updates it from what these return.

type Signer = { uid: string; email: string | null } | null;

const resultsOf = (snap: { docs: { id: string; data: () => unknown }[] }): ResultDoc[] =>
  snap.docs
    .filter((d) => (d.data() as { gradebookColumnId?: string }).gradebookColumnId)
    .map((d) => ({ id: d.id, ...(d.data() as Omit<ResultDoc, 'id'>) }));

/** The five reads a gradebook needs, as the page shows them. */
export async function loadGradebookData({
  institutionId,
  gradebookId,
  classId,
  subjectId,
  termId,
}: {
  institutionId: string;
  gradebookId: string;
  classId: string;
  subjectId: string;
  termId: string;
}): Promise<{
  students: StudentDoc[];
  columns: ColumnDoc[];
  results: ResultDoc[];
  feedback: FeedbackDoc[];
  exists: boolean;
}> {
  const [studentsSnap, columnsSnap, resultsSnap, feedbackSnap, gbSnap] = await Promise.all([
    getDocs(
      query(
        collection(db, 'users'),
        where('institutionId', '==', institutionId),
        where('role', '==', 'student'),
        // everyone in the class, home or additional (lib/studentClasses.ts)
        where('classIds', 'array-contains', classId),
      ),
    ),
    getDocs(institutionSubcollection(institutionId, 'gradebooks', gradebookId, 'columns')),
    getDocs(
      query(
        institutionCollection(institutionId, 'results'),
        where('classId', '==', classId),
        where('subjectId', '==', subjectId),
        where('termId', '==', termId),
      ),
    ),
    getDocs(
      query(
        institutionCollection(institutionId, 'feedback_comments'),
        where('classId', '==', classId),
        where('subjectId', '==', subjectId),
        where('termId', '==', termId),
      ),
    ),
    getDoc(institutionDoc(institutionId, 'gradebooks', gradebookId)),
  ]);

  return {
    // A student added to the class as an additional class may take only some of its subjects.
    students: studentsSnap.docs
      .filter((d) =>
        takesSubject(
          { classId: d.data().classId, classIds: d.data().classIds, classSubjects: readClassSubjects(d.data().classSubjects) },
          classId,
          subjectId,
        ),
      )
      .map((d) => ({
        id: d.id,
        name: d.data().name as string,
        gender: d.data().gender as string | undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    columns: columnsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() as GradebookColumnDocument) }))
      .sort((a, b) => a.order - b.order),
    results: resultsOf(resultsSnap),
    feedback: feedbackSnap.docs.map((d) => ({
      id: d.id,
      studentId: d.data().studentId as string,
      conductGrade: d.data().conductGrade as string | undefined,
      commentNumbers: d.data().commentNumbers as number[] | undefined,
    })),
    exists: gbSnap.exists(),
  };
}

/** Only the results, re-read after a save to pick up the ids of newly created documents. */
export async function reloadGradebookResults({
  institutionId,
  classId,
  subjectId,
  termId,
}: {
  institutionId: string;
  classId: string;
  subjectId: string;
  termId: string;
}): Promise<ResultDoc[]> {
  const snap = await getDocs(
    query(
      institutionCollection(institutionId, 'results'),
      where('classId', '==', classId),
      where('subjectId', '==', subjectId),
      where('termId', '==', termId),
    ),
  );
  return resultsOf(snap);
}

/** Everything the save needs to know; the page passes its state as it stands. */
export type SaveGradebookInput = {
  user: Signer;
  role: Role | null;
  displayName: string | null | undefined;
  institutionId: string;
  gradebookId: string;
  gradebookExists: boolean;
  selectedClassId: string;
  selectedSubjectId: string;
  selectedTermId: string;
  selectedClassName: string;
  termName: string;
  subjects: SubjectDoc[];
  students: StudentDoc[];
  columns: ColumnDoc[];
  effectiveColumns: ColumnDoc[];
  results: ResultDoc[];
  feedback: FeedbackDoc[];
  dirtyScores: DirtyScores;
  dirtyConduct: Record<string, string>;
  dirtyComments: Record<string, number[]>;
  pendingColumnEdits: Record<string, Partial<GradebookColumnDocument>>;
};

/** Saves every unsaved change of the gradebook in one batch, with its audit entries. */
export async function saveGradebookChanges({
  user,
  role,
  displayName,
  institutionId,
  gradebookId,
  gradebookExists,
  selectedClassId,
  selectedSubjectId,
  selectedTermId,
  selectedClassName,
  termName,
  subjects,
  students,
  columns,
  effectiveColumns,
  results,
  feedback,
  dirtyScores,
  dirtyConduct,
  dirtyComments,
  pendingColumnEdits,
}: SaveGradebookInput): Promise<void> {
  const batch = writeBatch(db);
  const gbDocRef = institutionDoc(institutionId, 'gradebooks', gradebookId);
  // Operations in this batch, counted as they are added: Firestore caps a
  // batch at 500, and the audit entries must not be what pushes a save over.
  let operations = 0;
  let scoresChanged = 0;
  let commentStudents = 0;

  // 1. Create gradebook parent doc on first save
  if (!gradebookExists) {
    operations++;
    batch.set(gbDocRef, {
      classId: selectedClassId,
      subjectId: selectedSubjectId,
      termId: selectedTermId,
      institutionId,
      createdAt: serverTimestamp(),
      createdBy: user?.uid ?? '',
    });
  }

  const subjectDoc = subjects.find((s) => s.id === selectedSubjectId);
  const teacherId = user?.uid ?? '';
  // The subject's lead teacher (never its assistant), as before; see lib/subjectTeachers.ts.
  const teacherName = (subjectDoc && leadTeacher(subjectDoc)?.name) || '';
  const departmentId = subjectDoc?.departmentId ?? '';

  // 2. Dirty score cells
  for (const studentId of Object.keys(dirtyScores)) {
    for (const colId of Object.keys(dirtyScores[studentId] ?? {})) {
      const effectiveCol = effectiveColumns.find((c) => c.id === colId);
      if (!effectiveCol) continue;
      const rawScore = dirtyScores[studentId][colId];
      const score = rawScore === '' ? 0 : Number(rawScore);
      const student = students.find((s) => s.id === studentId);
      const existingResult = results.find(
        (r) => r.gradebookColumnId === colId && r.studentId === studentId,
      );

      operations++;
      scoresChanged++;
      if (existingResult) {
        batch.update(institutionDoc(institutionId, 'results', existingResult.id), {
          score,
          maxScore: effectiveCol.maxScore,
          assessmentType: effectiveCol.assessmentType,
          columnWeight: effectiveCol.columnWeight,
          weight: effectiveCol.columnWeight,
        });
      } else {
        const newResultRef = doc(institutionCollection(institutionId, 'results'));
        batch.set(newResultRef, {
          studentId,
          studentName: student?.name ?? '',
          classId: selectedClassId,
          className: selectedClassName,
          termId: selectedTermId,
          institutionId,
          subjectId: selectedSubjectId,
          assessmentName: colId,
          assessmentType: effectiveCol.assessmentType,
          score,
          maxScore: effectiveCol.maxScore,
          weight: effectiveCol.columnWeight,
          date: effectiveCol.date ?? '',
          gradebookColumnId: colId,
          columnWeight: effectiveCol.columnWeight,
          source: 'gradebook',
          teacherId,
          teacherName,
          departmentId,
          createdAt: serverTimestamp(),
        });
      }
    }
  }

  // 3. Dirty conduct / comments (upsert deterministic-ID docs)
  for (const student of students) {
    const hasDirtyConduct = dirtyConduct[student.id] !== undefined;
    const hasDirtyComments = dirtyComments[student.id] !== undefined;
    if (!hasDirtyConduct && !hasDirtyComments) continue;

    const fbDocRef = institutionDoc(
      institutionId,
      'feedback_comments',
      `${student.id}_${selectedSubjectId}_${selectedTermId}`,
    );
    const existingFb = feedback.find((f) => f.studentId === student.id);
    const conductGrade = hasDirtyConduct
      ? dirtyConduct[student.id]
      : (existingFb?.conductGrade ?? '');
    const commentNumbers = hasDirtyComments
      ? dirtyComments[student.id]
      : (existingFb?.commentNumbers ?? []);

    operations++;
    commentStudents++;
    batch.set(
      fbDocRef,
      {
        studentId: student.id,
        studentName: student.name,
        classId: selectedClassId,
        className: selectedClassName,
        termId: selectedTermId,
        institutionId,
        subjectId: selectedSubjectId,
        conductGrade,
        commentNumbers,
        teacherId,
        teacherName,
        departmentId,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  // 4. Pending column metadata edits
  for (const colId of Object.keys(pendingColumnEdits)) {
    const edits = pendingColumnEdits[colId];
    const colDocRef = institutionSubdoc(institutionId, 'gradebooks', gradebookId, 'columns', colId);
    operations++;
    batch.update(colDocRef, edits);

    // Proportional scale existing result scores if maxScore changed
    if (edits.maxScore !== undefined) {
      const oldCol = columns.find((c) => c.id === colId);
      if (oldCol && oldCol.maxScore !== edits.maxScore && oldCol.maxScore > 0) {
        for (const result of results) {
          if (result.gradebookColumnId !== colId) continue;
          const isDirtyScore = dirtyScores[result.studentId]?.[colId] !== undefined;
          if (!isDirtyScore) {
            const scaled = Math.round((result.score / oldCol.maxScore) * edits.maxScore);
            operations++;
            batch.update(institutionDoc(institutionId, 'results', result.id), {
              score: scaled,
              maxScore: edits.maxScore,
            });
          }
        }
      }
    }

    // Sync columnWeight on all linked results
    if (edits.columnWeight !== undefined) {
      for (const result of results) {
        if (result.gradebookColumnId !== colId) continue;
        operations++;
        batch.update(institutionDoc(institutionId, 'results', result.id), {
          columnWeight: edits.columnWeight,
          weight: edits.columnWeight,
        });
      }
    }
  }

  // Audit entries: one for the scores and column edits (results_edit), one for
  // conduct grades and comments saved from the grid (comment_edit). Names only,
  // never scores or comment text. Added to the SAME batch when they fit under
  // the 500-operation cap, so a save is never unrecorded; otherwise the save
  // commits exactly as it always did and they are written right after,
  // best-effort.
  const columnsEdited = Object.keys(pendingColumnEdits).length;
  const subjectName = subjectDoc?.name ?? '';
  const auditEntries: AuditEventInput[] = [];
  if (user && institutionId !== '*') {
    const base = {
      institutionId,
      targetUid: selectedClassId,
      targetName: selectedClassName,
      performedBy: user.uid,
      performedByName: actorName(displayName, user.email, staffFallback(role)),
    };
    if (scoresChanged > 0 || columnsEdited > 0) {
      auditEntries.push({
        ...base,
        eventType: 'results_edit',
        detail: gradebookSaveDetail({
          className: selectedClassName,
          subjectName,
          termName,
          scoresChanged,
          columnsEdited,
        }),
      });
    }
    if (commentStudents > 0) {
      auditEntries.push({
        ...base,
        eventType: 'comment_edit',
        detail: gradebookCommentsDetail({
          className: selectedClassName,
          subjectName,
          termName,
          students: commentStudents,
        }),
      });
    }
  }
  const auditInBatch = fitsInBatch(operations, auditEntries.length);
  if (auditInBatch) {
    for (const entry of auditEntries) {
      batch.set(doc(institutionCollection(institutionId, 'audit_log')), buildAuditEntry(entry));
    }
  }

  await batch.commit();

  if (!auditInBatch) {
    for (const entry of auditEntries) {
      try {
        await logAuditEvent(entry);
      } catch {
        // Best-effort: the save itself has already succeeded.
      }
    }
  }
}

/** Deletes a column with its results and closes the gap in the column order, recording it in the audit log. */
export async function deleteGradebookColumn({
  user,
  role,
  displayName,
  institutionId,
  gradebookId,
  deletedColumn,
  columns,
  results,
  selectedClassId,
  selectedClassName,
  subjectName,
  termName,
}: {
  user: Signer;
  role: Role | null;
  displayName: string | null | undefined;
  institutionId: string;
  gradebookId: string;
  deletedColumn: ColumnDoc;
  columns: ColumnDoc[];
  results: ResultDoc[];
  selectedClassId: string;
  selectedClassName: string;
  subjectName: string;
  termName: string;
}): Promise<void> {
  const colId = deletedColumn.id;
  const deletedOrder = deletedColumn.order;

  const batch = writeBatch(db);
  let operations = 0;

  operations++;
  batch.delete(institutionSubdoc(institutionId, 'gradebooks', gradebookId, 'columns', colId));

  const deletedResults = results.filter((r) => r.gradebookColumnId === colId);
  for (const result of deletedResults) {
    operations++;
    batch.delete(institutionDoc(institutionId, 'results', result.id));
  }

  for (const col of columns.filter((c) => c.order > deletedOrder)) {
    operations++;
    batch.update(institutionSubdoc(institutionId, 'gradebooks', gradebookId, 'columns', col.id), {
      order: col.order - 1,
    });
  }

  // Deleting a column deletes its results too, so it is recorded: in the same
  // batch when it fits under the 500-operation cap, else right after (best-effort).
  let deleteAudit: AuditEventInput | null = null;
  if (user && institutionId !== '*') {
    deleteAudit = {
      institutionId,
      eventType: 'results_edit',
      detail: gradebookColumnDeleteDetail({
        className: selectedClassName,
        subjectName,
        termName,
        columnLabel: deletedColumn.label,
        resultsDeleted: deletedResults.length,
      }),
      targetUid: selectedClassId,
      targetName: selectedClassName,
      performedBy: user.uid,
      performedByName: actorName(displayName, user.email, staffFallback(role)),
    };
  }
  const deleteAuditInBatch = deleteAudit !== null && fitsInBatch(operations);
  if (deleteAudit && deleteAuditInBatch) {
    batch.set(doc(institutionCollection(institutionId, 'audit_log')), buildAuditEntry(deleteAudit));
  }

  await batch.commit();

  if (deleteAudit && !deleteAuditInBatch) {
    try {
      await logAuditEvent(deleteAudit);
    } catch {
      // Best-effort: the column has already been deleted.
    }
  }
}
