import { useState, useEffect } from "react";
import { onSnapshot, query, where } from "firebase/firestore";
import { onLoadError } from "@/lib/reportError";
import { institutionCollection } from "@/lib/paths";
import type { Activity, Responsibility, DisciplinaryEntry } from "@/lib/studentDetailLogic";

// What the student detail page (scenes/(dashboard)/list/students/[id]) reads for the term it shows: the
// student's activities, positions of responsibility, disciplinary entries and report card comments. With no
// term chosen (or no single institution) everything is empty. Moved from the page as it was.
export function useStudentTermRecords(id: string | undefined, selectedTermId: string, institutionId: string | null | undefined) {
  // Activities
  const [activities, setActivities] = useState<Activity[]>([]);

  // Responsibilities
  const [responsibilities, setResponsibilities] = useState<Responsibility[]>(
    [],
  );

  // Disciplinary record
  const [disciplinaryActions, setDisciplinaryActions] = useState<
    DisciplinaryEntry[]
  >([]);

  // Report card comments
  const [commentDocId, setCommentDocId] = useState<string | null>(null);
  const [classSupervisorComment, setClassSupervisorComment] = useState("");
  const [gradeSupervisorComment, setGradeSupervisorComment] = useState("");
  const [principalComment, setPrincipalComment] = useState("");
  const [vicePrincipalComment, setVicePrincipalComment] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentSaved, setCommentSaved] = useState(false);

  useEffect(() => {
    if (!id || !selectedTermId || !institutionId || institutionId === "*") {
      setActivities([]);
      return;
    }
    return onSnapshot(
      query(
        institutionCollection(institutionId, "studentActivities"),
        where("studentId", "==", id),
        where("termId", "==", selectedTermId),
      ),
      (snap) =>
        setActivities(
          snap.docs.map((d) => ({
            id: d.id,
            activityName: d.data().activityName as string,
          })),
        ),
      onLoadError("activities"),
    );
  }, [id, selectedTermId, institutionId]);

  useEffect(() => {
    if (!id || !selectedTermId || !institutionId || institutionId === "*") {
      setResponsibilities([]);
      return;
    }
    return onSnapshot(
      query(
        institutionCollection(institutionId, "studentResponsibilities"),
        where("studentId", "==", id),
        where("termId", "==", selectedTermId),
      ),
      (snap) =>
        setResponsibilities(
          snap.docs.map((d) => ({
            id: d.id,
            title: d.data().title as string,
            organisation: (d.data().organisation as string | null) ?? null,
          })),
        ),
      onLoadError("positions of responsibility"),
    );
  }, [id, selectedTermId, institutionId]);

  useEffect(() => {
    if (!id || !selectedTermId || !institutionId || institutionId === "*") {
      setDisciplinaryActions([]);
      return;
    }
    return onSnapshot(
      query(
        institutionCollection(institutionId, "disciplinaryActions"),
        where("studentId", "==", id),
        where("termId", "==", selectedTermId),
      ),
      (snap) =>
        setDisciplinaryActions(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }) as DisciplinaryEntry)
            .sort((a, b) => b.date.localeCompare(a.date)),
        ),
      onLoadError("disciplinary records"),
    );
  }, [id, selectedTermId, institutionId]);

  useEffect(() => {
    if (!id || !selectedTermId || !institutionId || institutionId === "*") {
      setCommentDocId(null);
      setClassSupervisorComment("");
      setGradeSupervisorComment("");
      setPrincipalComment("");
      setVicePrincipalComment("");
      setCommentSaved(false);
      setCommentError(null);
      return;
    }
    return onSnapshot(
      query(
        institutionCollection(institutionId, "reportCardComments"),
        where("studentId", "==", id),
        where("termId", "==", selectedTermId),
      ),
      (snap) => {
        if (snap.empty) {
          setCommentDocId(null);
          setClassSupervisorComment("");
          setGradeSupervisorComment("");
          setPrincipalComment("");
          setVicePrincipalComment("");
        } else {
          const d = snap.docs[0];
          setCommentDocId(d.id);
          setClassSupervisorComment(
            (d.data().classSupervisorComment as string) ?? "",
          );
          setGradeSupervisorComment(
            (d.data().gradeSupervisorComment as string) ?? "",
          );
          setPrincipalComment((d.data().principalComment as string) ?? "");
          setVicePrincipalComment(
            (d.data().vicePrincipalComment as string) ?? "",
          );
        }
      },
      onLoadError("report card comments"),
    );
  }, [id, selectedTermId, institutionId]);

  return {
    activities,
    responsibilities,
    disciplinaryActions,
    commentDocId,
    classSupervisorComment,
    setClassSupervisorComment,
    gradeSupervisorComment,
    setGradeSupervisorComment,
    principalComment,
    setPrincipalComment,
    vicePrincipalComment,
    setVicePrincipalComment,
    commentError,
    setCommentError,
    commentSaved,
    setCommentSaved,
  };
}
