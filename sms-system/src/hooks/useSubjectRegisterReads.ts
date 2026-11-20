import { useEffect, useState } from 'react';
import { onLoadError } from '@/lib/reportError';
import { fetchEnrolledStudents } from '@/lib/subjectAttendanceSave';
import { subjectWeek, watchRegisters } from '@/lib/offline/registerReads';
import { olderCopy } from '@/lib/offline/workingCopy';
import type { StudentRow } from '@/lib/generalAttendanceLogic';
import type { SubjectAttendanceDoc } from '@/lib/subjectAttendanceLogic';

// What the Subject Attendance Register page (scenes/(dashboard)/attendance/subject) reads for the chosen subject
// and class: the students enrolled in it, and the registers already saved for the week shown. Offline, both come
// from the working copies saved the last time they were read (lib/offline/registerReads.ts); copySavedAt says when.
export function useSubjectRegisterReads(
  institutionId: string | null | undefined,
  selectedSubjectId: string,
  selectedClassId: string,
  weekStartISO: string,
  weekEnd: string,
) {
  const [enrolledStudents, setEnrolledStudents] = useState<StudentRow[]>([]);
  const [studentsCopyAt, setStudentsCopyAt] = useState<number | null>(null);
  const [savedDocs, setSavedDocs] = useState<SubjectAttendanceDoc[]>([]);
  const [docsCopyAt, setDocsCopyAt] = useState<number | null>(null);

  // ── Load enrolled students whenever subject+class changes ──
  useEffect(() => {
    setStudentsCopyAt(null);
    if (!selectedSubjectId || !selectedClassId || !institutionId) {
      setEnrolledStudents([]);
      return;
    }
    let current = true;
    fetchEnrolledStudents(institutionId, selectedSubjectId, selectedClassId).then(
      (read) => {
        if (!current) return;
        setEnrolledStudents(read.value);
        setStudentsCopyAt(read.savedAt);
      },
      onLoadError("the class's students", () => current && setEnrolledStudents([])),
    );
    return () => {
      current = false;
    };
  }, [selectedSubjectId, selectedClassId, institutionId]);

  // ── Live query for saved docs in the current week ──
  useEffect(() => {
    setDocsCopyAt(null);
    if (!selectedSubjectId || !selectedClassId || !institutionId) { setSavedDocs([]); return; }
    return watchRegisters(
      subjectWeek(institutionId, selectedSubjectId, selectedClassId, weekStartISO, weekEnd),
      (read) => {
        setSavedDocs(read.value);
        setDocsCopyAt(read.savedAt);
      },
      onLoadError("this week's attendance"),
    );
  }, [selectedSubjectId, selectedClassId, institutionId, weekStartISO, weekEnd]);

  return { enrolledStudents, savedDocs, copySavedAt: olderCopy(studentsCopyAt, docsCopyAt) };
}
