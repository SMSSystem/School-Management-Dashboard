import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { onLoadError } from "@/lib/reportError";
import { institutionCollection } from "@/lib/paths";
import {
  enrollmentsByClass,
  type EnrollmentsByClass,
  type SubjectFormRecord,
} from "@/lib/subjectFormLogic";

// The student side of the subject form (components/forms/SubjectForm): each class's enrolment choice, read from
// the subject's stored enrolments when editing, and the students of a class, read when the admin unticks "All
// students enrolled" for it. Moved from the form as it was.
export function useSubjectEnrollmentChoices({
  type,
  data,
  institutionId,
}: {
  type: "create" | "update";
  data: SubjectFormRecord | undefined;
  institutionId: string | null;
}) {
  const [enrollmentByClass, setEnrollmentByClass] = useState<EnrollmentsByClass>({});
  const [classStudents, setClassStudents] = useState<
    Record<string, { uid: string; name: string }[]>
  >({});

  useEffect(() => {
    if (type === 'update' && data) {
      if (data.id && institutionId) {
        getDocs(
          query(institutionCollection(institutionId, 'subjectEnrollments'), where('subjectId', '==', data.id))
        ).then((snap) => {
          setEnrollmentByClass(enrollmentsByClass(snap.docs.map((d) => d.data())));
        }, onLoadError("this subject's student enrolments"));
      }
    }
  }, [type, data, institutionId]);

  async function loadStudentsForClass(classId: string) {
    if (classStudents[classId]) return;
    const snap = await getDocs(
      query(
        collection(db, 'users'),
        where('institutionId', '==', institutionId),
        where('role', '==', 'student'),
        // everyone in the class, home or additional (lib/studentClasses.ts)
        where('classIds', 'array-contains', classId),
      )
    );
    setClassStudents((prev) => ({
      ...prev,
      [classId]: snap.docs
        .map((d) => ({ uid: d.id, name: d.data().name as string }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    }));
  }

  return { enrollmentByClass, setEnrollmentByClass, classStudents, loadStudentsForClass };
}
