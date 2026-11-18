import { useEffect, useMemo, useState } from "react";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";
import {
  getPersistedFilter,
  setPersistedFilter,
} from "@/lib/filterPersistence";
import { useCurrentTerm } from "@/lib/CurrentTermContext";
import { useInstitutionTerms } from "@/hooks/useInstitutionTerms";
import { useInstitutionClasses } from "@/hooks/useInstitutionClasses";
import { useInstitutionSubjects } from "@/hooks/useInstitutionSubjects";
import {
  subjectsForRole,
  visibleClassesFor,
  visibleSubjectsFor,
  type SubjectDoc,
} from "@/lib/gradebookLogic";

const FILTER_PAGE = "gradebook";

// What the Gradebook page is looking at: the term, class and subject (restored from the last selection this
// session), the reference lists they come from, and the classes and subjects the signed-in role may pick.
export function useGradebookScope() {
  const { user, role, institution } = useAuth();

  // Selection — class/subject restored from the last selection made this
  // session (cleared on logout), per DEV_NOTES Item 6.1. Term reads/writes the
  // app-wide "current term" (Item 6.2) — changing it here also updates it on
  // the other synced pages (Schedule, Attendance Gridsheet, Report Card
  // Comments, Grade-Entry Tracking) the next time they're visited.
  const { currentTermId: selectedTermId, setCurrentTermId: setSelectedTermId } =
    useCurrentTerm();
  const [selectedClassId, setSelectedClassId] = useState(() =>
    getPersistedFilter(FILTER_PAGE, "selectedClassId"),
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState(() =>
    getPersistedFilter(FILTER_PAGE, "selectedSubjectId"),
  );

  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, "selectedClassId", selectedClassId);
  }, [selectedClassId]);

  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, "selectedSubjectId", selectedSubjectId);
  }, [selectedSubjectId]);

  // Reference data (shared cached queries — see hooks/useInstitutionX.ts)
  const { data: terms = [] } = useInstitutionTerms();
  const { data: classes = [] } = useInstitutionClasses();
  // useInstitutionSubjects() server-filters for regular_teacher (rule-shape
  // parity with other consumers); Gradebook additionally narrows for
  // senior_teacher client-side, since that page-level restriction was never
  // a rule requirement (verified against firestore.rules — see the hook's
  // own comment) but this page still wants it for its own UX.
  const { data: rawSubjects = [] } = useInstitutionSubjects();
  const subjects = useMemo<SubjectDoc[]>(
    () => subjectsForRole(rawSubjects, role, user?.uid ?? ""),
    [rawSubjects, role, user?.uid],
  );
  const [assignedClassId, setAssignedClassId] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Role-filtered class / subject options
  // ---------------------------------------------------------------------------

  // The Class list follows the Term list: only the classes of the selected term (lib/gradebookLogic.ts classInTerm).
  const isCustomMode = institution?.calendarMode === "custom";
  const visibleClasses = useMemo(
    () =>
      visibleClassesFor({
        classes,
        subjects,
        role,
        uid: user?.uid ?? "",
        assignedClassId,
        termScope: { selectedTermId, terms, isCustomMode },
      }),
    [
      classes,
      subjects,
      role,
      user?.uid,
      assignedClassId,
      selectedTermId,
      terms,
      isCustomMode,
    ],
  );

  const visibleSubjects = useMemo(
    () =>
      visibleSubjectsFor({
        subjects,
        selectedClassId,
        role,
        uid: user?.uid ?? "",
      }),
    [subjects, selectedClassId, role, user?.uid],
  );

  // ---------------------------------------------------------------------------
  // Reference data subscriptions (live)
  // ---------------------------------------------------------------------------

  // Fetch senior teacher's assignedClassId
  useEffect(() => {
    if (role === "senior_teacher" && user?.uid) {
      getDoc(doc(db, "users", user.uid)).then((snap) => {
        if (snap.exists())
          setAssignedClassId((snap.data().assignedClassId as string) ?? null);
      }, onLoadError("your class"));
    }
  }, [role, user?.uid]);

  // Active-term defaulting is now centralized in CurrentTermContext (Item 6.2).

  // Auto-select senior teacher's class
  useEffect(() => {
    if (
      role === "senior_teacher" &&
      assignedClassId &&
      classes.some((c) => c.id === assignedClassId)
    ) {
      setSelectedClassId(assignedClassId);
    }
  }, [role, assignedClassId, classes]);

  // Drop a restored or chosen classId once classes have loaded and it's no longer valid (e.g. deleted, not
  // visible to this role, or not a class of the term now selected) — per DEV_NOTES Item 6.1.
  // A senior teacher's one class is set by the effect above, so it is checked against every class; a regular
  // teacher's list waits for their subjects, so nothing is dropped before those have loaded.
  useEffect(() => {
    const ready =
      classes.length > 0 && (role !== "regular_teacher" || subjects.length > 0);
    const allowed = role === "senior_teacher" ? classes : visibleClasses;
    if (
      selectedClassId &&
      ready &&
      !allowed.some((c) => c.id === selectedClassId)
    ) {
      setSelectedClassId("");
    }
  }, [selectedClassId, classes, subjects.length, role, visibleClasses]);

  // Auto-select subject if only one is eligible; otherwise keep a still-valid
  // selection (including one restored from a persisted filter) and clear only
  // once subjects have loaded and it's no longer among the valid options.
  useEffect(() => {
    if (visibleSubjects.length === 1 && selectedClassId) {
      setSelectedSubjectId(visibleSubjects[0].id);
    } else if (
      selectedSubjectId &&
      subjects.length > 0 &&
      !visibleSubjects.some((s) => s.id === selectedSubjectId)
    ) {
      setSelectedSubjectId("");
    }
  }, [visibleSubjects, selectedClassId, selectedSubjectId, subjects.length]);

  return {
    terms,
    classes,
    subjects,
    selectedTermId,
    setSelectedTermId,
    selectedClassId,
    setSelectedClassId,
    selectedSubjectId,
    setSelectedSubjectId,
    visibleClasses,
    visibleSubjects,
  };
}
