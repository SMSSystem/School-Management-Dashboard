import { useEffect, useState } from "react";
import { collection, doc, getDoc, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import { useLinkedStudentIds } from "@/lib/useLinkedStudentIds";
import { institutionSubcollection, institutionSubdoc } from "@/lib/paths";
import { buildRoster, canViewRoster, type Assignment, type RosterStudent, type Submission } from "@/lib/assignmentDetailLogic";

// What the assignment detail page (scenes/(dashboard)/list/assignments/[id]) reads about the people on it, by
// who is looking: the class roster and every student's submission for a teacher or spectator, a student's own
// submission, and for a parent the linked child in the assignment's class and that child's submission. Moved
// from the page as it was.
export function useAssignmentParticipants(id: string | undefined, assignment: Assignment | null) {
  const { role, institutionId, user } = useAuth();

  const [roster, setRoster] = useState<RosterStudent[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [submissionsByStudent, setSubmissionsByStudent] = useState<Record<string, Submission>>({});

  const [mySubmission, setMySubmission] = useState<Submission | null>(null);

  const { linkedStudentIds } = useLinkedStudentIds();
  const [childId, setChildId] = useState<string | null>(null);
  const [childSubmission, setChildSubmission] = useState<Submission | null>(null);

  // Class roster — teacher/admin roles only, so a student/parent viewer
  // never triggers a query their own read scope wouldn't need anyway.
  useEffect(() => {
    if (!institutionId || institutionId === "*" || !assignment?.classId || !canViewRoster(role)) {
      setRoster([]);
      return;
    }
    setRosterLoading(true);
    return onSnapshot(
      query(
        collection(db, "users"),
        where("institutionId", "==", institutionId),
        where("role", "==", "student"),
        // everyone in the class, home or additional (lib/studentClasses.ts)
        where("classIds", "array-contains", assignment.classId),
      ),
      (snap) => {
        setRoster(buildRoster(snap.docs.map((d) => ({ id: d.id, data: d.data() })), assignment.classId, assignment.subjectId));
        setRosterLoading(false);
      },
      () => setRosterLoading(false),
    );
  }, [institutionId, assignment?.classId, assignment?.subjectId, role]);

  // Every student's current submission state for this assignment — §6.2's
  // "unfiltered, path-scoped" teacher grading view (small collection,
  // bounded by class size, no composite index needed).
  useEffect(() => {
    if (!institutionId || institutionId === "*" || !id || !canViewRoster(role)) {
      setSubmissionsByStudent({});
      return;
    }
    return onSnapshot(
      institutionSubcollection(institutionId, "assignments", id, "submissions"),
      (snap) => {
        const map: Record<string, Submission> = {};
        snap.docs.forEach((d) => {
          map[d.id] = { id: d.id, ...d.data() } as Submission;
        });
        setSubmissionsByStudent(map);
      },
      () => setSubmissionsByStudent({}),
    );
  }, [institutionId, id, role]);

  // Student's own submission — a direct single-document read (§6.2), not a query.
  useEffect(() => {
    if (!institutionId || institutionId === "*" || !id || role !== "student" || !user) {
      setMySubmission(null);
      return;
    }
    return onSnapshot(
      institutionSubdoc(institutionId, "assignments", id, "submissions", user.uid),
      (snap) => setMySubmission(snap.exists() ? ({ id: snap.id, ...snap.data() } as Submission) : null),
      () => setMySubmission(null),
    );
  }, [institutionId, id, role, user]);

  // Parent: resolve which linked child is actually in this assignment's
  // class (assignments are classId-keyed, not studentId-keyed — same
  // resolution list/assignments/index.tsx's own parent query already does).
  useEffect(() => {
    if (role !== "parent" || !assignment?.classId || linkedStudentIds.length === 0) {
      setChildId(null);
      return;
    }
    let cancelled = false;
    (async () => {
      for (const sid of linkedStudentIds) {
        const snap = await getDoc(doc(db, "users", sid));
        if (snap.data()?.classId === assignment.classId) {
          if (!cancelled) setChildId(sid);
          return;
        }
      }
      if (!cancelled) setChildId(null);
    })().catch((err) => {
      if (!cancelled) onLoadError("your child's class", () => setChildId(null))(err);
    });
    return () => {
      cancelled = true;
    };
  }, [role, assignment?.classId, linkedStudentIds]);

  useEffect(() => {
    if (!institutionId || institutionId === "*" || !id || role !== "parent" || !childId) {
      setChildSubmission(null);
      return;
    }
    return onSnapshot(
      institutionSubdoc(institutionId, "assignments", id, "submissions", childId),
      (snap) => setChildSubmission(snap.exists() ? ({ id: snap.id, ...snap.data() } as Submission) : null),
      () => setChildSubmission(null),
    );
  }, [institutionId, id, role, childId]);

  return { roster, rosterLoading, submissionsByStudent, mySubmission, childId, childSubmission };
}
