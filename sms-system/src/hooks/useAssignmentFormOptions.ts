import { useEffect, useState } from "react";
import { doc, getDoc, getDocs } from "firebase/firestore";
import type { User } from "firebase/auth";
import { db } from "@/lib/firebase";
import { onLoadError } from "@/lib/reportError";
import { institutionSubcollection } from "@/lib/paths";
import type { TeacherMeta } from "@/lib/assignmentFormLogic";
import { useTeachersMeta } from "@/hooks/useTeachersMeta";
import { useRubricsList } from "@/hooks/useRubricsList";

// What the assignment form (components/forms/AssignmentForm) reads for its pickers: the rubrics, the columns of
// the gradebook the chosen class, subject and term share, the signed-in teacher's own name, and every teacher's
// department and role. Moved from the form as it was, including the guards that keep a super admin's "*" out of
// the path builders.
export function useAssignmentFormOptions({
  institutionId,
  user,
  isTeacherRole,
  type,
  gradebookId,
  watchedGradingMode,
}: {
  institutionId: string | null;
  user: User | null;
  isTeacherRole: boolean;
  type: "create" | "update";
  gradebookId: string | null;
  watchedGradingMode: "standalone" | "gradebook";
}) {
  // teacherId -> {departmentId, role}. departmentId is needed at write time
  // (the deployed `assignments` rule lets a senior_teacher edit any
  // assignment in their department via this field); role feeds the new
  // denormalized teacherRole field (ASSIGNMENTS_FEATURE_SPEC.md §4.1).
  const teacherMetaById: Record<string, TeacherMeta> = useTeachersMeta();
  const [ownName, setOwnName] = useState("");

  // Rubric picker options: the same shared live listener as the Rubrics page (useRubricsList.ts), so opening the form
  // after the page reads nothing. Quiet: an empty picker is harmless (rubricId stays optional), so a failure here
  // doesn't block creating an assignment.
  const { rubrics: listedRubrics } = useRubricsList({ quiet: true });
  const rubrics = listedRubrics.map((r) => ({
    id: r.id,
    title: r.title ?? "Untitled rubric",
  }));

  // Gradebook column picker options — only fetched in "gradebook" mode, once
  // class/subject/term are all chosen (gradebookId is deterministic:
  // classId_subjectId_termId, same as list/gradebook/index.tsx).
  const [gradebookColumns, setGradebookColumns] = useState<
    { id: string; label: string; maxScore: number; order: number }[]
  >([]);
  useEffect(() => {
    if (
      !institutionId ||
      institutionId === "*" ||
      !gradebookId ||
      watchedGradingMode !== "gradebook"
    ) {
      setGradebookColumns([]);
      return;
    }
    getDocs(
      institutionSubcollection(
        institutionId,
        "gradebooks",
        gradebookId,
        "columns",
      ),
    )
      .then((snap) => {
        setGradebookColumns(
          snap.docs
            .map((d) => ({
              id: d.id,
              label:
                (d.data().label as string | undefined) ?? "Untitled column",
              maxScore: (d.data().maxScore as number | undefined) ?? 0,
              order: (d.data().order as number | undefined) ?? 0,
            }))
            .sort((a, b) => a.order - b.order),
        );
      })
      .catch(() => setGradebookColumns([]));
  }, [institutionId, gradebookId, watchedGradingMode]);

  useEffect(() => {
    if (!isTeacherRole || !user || type === "update") return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) setOwnName((snap.data().name as string) ?? "");
    }, onLoadError("your name"));
  }, [isTeacherRole, user, type]);

  return { rubrics, gradebookColumns, teacherMetaById, ownName };
}
