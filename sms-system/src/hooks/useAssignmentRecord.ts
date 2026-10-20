import { useEffect, useState } from "react";
import { getDoc, onSnapshot } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import { institutionDoc, institutionSubdoc } from "@/lib/paths";
import { assignmentGradebookId, type Assignment, type Rubric } from "@/lib/assignmentDetailLogic";

// What the assignment detail page (scenes/(dashboard)/list/assignments/[id]) reads about the assignment itself:
// the document, its rubric, and the max score of the gradebook column it is linked to. Moved from the page as
// it was.
export function useAssignmentRecord(id: string | undefined) {
  const { institutionId } = useAuth();

  const [assignment, setAssignment] = useState<Assignment | null>(null);
  const [assignmentLoading, setAssignmentLoading] = useState(true);
  // Distinguishes "doesn't exist" from "exists, but firestore.rules denies
  // this reader" — onSnapshot's error callback fires for the latter (a
  // get() on one specific denied document errors, unlike a list query that
  // just returns nothing). Both render the same not-found-style message:
  // confirming *which* case it is would leak whether the document exists
  // to someone who isn't allowed to see it.
  const [denied, setDenied] = useState(false);

  const [rubric, setRubric] = useState<Rubric | null>(null);

  // gradingMode === 'gradebook' only — the linked column's own maxScore,
  // locked in the grading form rather than left freely editable (§4.3
  // mirrors performSave(), which always writes maxScore: effectiveCol.maxScore,
  // never a per-result value).
  const [gradebookColumnMaxScore, setGradebookColumnMaxScore] = useState<number | null>(null);

  useEffect(() => {
    if (!id || !institutionId || institutionId === "*") return;
    setAssignmentLoading(true);
    setDenied(false);
    return onSnapshot(
      institutionDoc(institutionId, "assignments", id),
      (snap) => {
        setAssignmentLoading(false);
        setAssignment(snap.exists() ? ({ id: snap.id, ...snap.data() } as Assignment) : null);
      },
      () => {
        setAssignmentLoading(false);
        setDenied(true);
      },
    );
  }, [id, institutionId]);

  useEffect(() => {
    if (!institutionId || institutionId === "*" || !assignment?.rubricId) {
      setRubric(null);
      return;
    }
    return onSnapshot(
      institutionDoc(institutionId, "rubrics", assignment.rubricId),
      (snap) => setRubric(snap.exists() ? ({ id: snap.id, ...snap.data() } as Rubric) : null),
      () => setRubric(null),
    );
  }, [institutionId, assignment?.rubricId]);

  useEffect(() => {
    if (
      !institutionId ||
      institutionId === "*" ||
      assignment?.gradingMode !== "gradebook" ||
      !assignment.gradebookColumnId
    ) {
      setGradebookColumnMaxScore(null);
      return;
    }
    const gradebookId = assignmentGradebookId({ classId: assignment.classId, subjectId: assignment.subjectId, termId: assignment.termId });
    getDoc(
      institutionSubdoc(institutionId, "gradebooks", gradebookId, "columns", assignment.gradebookColumnId),
    ).then(
      (snap) => setGradebookColumnMaxScore((snap.data()?.maxScore as number | undefined) ?? null),
      onLoadError("the gradebook column", () => setGradebookColumnMaxScore(null)),
    );
  }, [institutionId, assignment?.gradingMode, assignment?.gradebookColumnId, assignment?.classId, assignment?.subjectId, assignment?.termId]);

  return { assignment, assignmentLoading, denied, rubric, gradebookColumnMaxScore };
}
