import { useEffect, useState } from 'react';
import { onSnapshot, query, where } from 'firebase/firestore';
import { onLoadError } from '@/lib/reportError';
import { institutionCollection } from '@/lib/paths';
import { fetchEnrolledStudents } from '@/lib/subjectAttendanceSave';
import type { StudentRow } from '@/lib/generalAttendanceLogic';
import type { SubjectAttendanceDoc } from '@/lib/subjectAttendanceLogic';

// What the Subject Attendance Register page (scenes/(dashboard)/attendance/subject) reads for the chosen subject
// and class: the students enrolled in it, and the registers already saved for the week shown. Moved from the
// page as it was.
export function useSubjectRegisterReads(
  institutionId: string | null | undefined,
  selectedSubjectId: string,
  selectedClassId: string,
  weekStartISO: string,
  weekEnd: string,
) {
  // Enrolled students for the selected subject + class
  const [enrolledStudents, setEnrolledStudents] = useState<StudentRow[]>([]);

  // Saved Firestore docs for the current week
  const [savedDocs, setSavedDocs] = useState<SubjectAttendanceDoc[]>([]);

  // ── Load enrolled students whenever subject+class changes ──
  useEffect(() => {
    if (!selectedSubjectId || !selectedClassId || !institutionId) {
      setEnrolledStudents([]);
      return;
    }
    fetchEnrolledStudents(institutionId, selectedSubjectId, selectedClassId).then(
      setEnrolledStudents,
      onLoadError("the class's students", () => setEnrolledStudents([])),
    );
  }, [selectedSubjectId, selectedClassId, institutionId]);

  // ── Live query for saved docs in the current week ──
  useEffect(() => {
    if (!selectedSubjectId || !selectedClassId || !institutionId) { setSavedDocs([]); return; }
    const unsub = onSnapshot(
      query(
        institutionCollection(institutionId, 'subjectAttendance'),
        where('subjectId', '==', selectedSubjectId),
        where('classId', '==', selectedClassId),
        where('sessionDate', '>=', weekStartISO),
        where('sessionDate', '<=', weekEnd),
      ),
      (snap) => {
        setSavedDocs(
          snap.docs.map((d) => ({
            id: d.id,
            sessionDate: d.data().sessionDate as string,
            submittedAt: d.data().submittedAt,
            records: d.data().records as SubjectAttendanceDoc['records'],
          }))
        );
      },
      onLoadError("this week's attendance"),
    );
    return unsub;
  }, [selectedSubjectId, selectedClassId, institutionId, weekStartISO, weekEnd]);

  return { enrolledStudents, savedDocs };
}
