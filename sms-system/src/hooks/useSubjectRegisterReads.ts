import { useEffect, useRef, useState } from 'react';
import { onLoadError } from '@/lib/reportError';
import { fetchEnrolledStudents } from '@/lib/subjectAttendanceSave';
import { subjectWeek, watchRegisters } from '@/lib/offline/registerReads';
import { olderCopy } from '@/lib/offline/workingCopy';
import type { StudentRow } from '@/lib/generalAttendanceLogic';
import type { SubjectAttendanceDoc } from '@/lib/subjectAttendanceLogic';

// What the Subject Attendance Register page (scenes/(dashboard)/attendance/subject) reads for the chosen subject
// and class: the students enrolled in it, and the registers already saved for the week shown. Offline, both come
// from the working copies saved the last time they were read (lib/offline/registerReads.ts); copySavedAt says when.
// Back online, the students are read again once the week's listener hears the server, as on the General page.
// studentsLoading lets the page say it's loading rather than that nobody is enrolled while the first read runs. It is
// worked out during render (the students weren't read for this subject and class yet), so no frame shows an empty list.
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
  const studentsOnCopy = useRef(false);
  const [studentsRetry, setStudentsRetry] = useState(0);
  const studentsKey = `${institutionId ?? ''}|${selectedSubjectId}|${selectedClassId}`;
  const [studentsReadFor, setStudentsReadFor] = useState<string | null>(null);
  const studentsLoading =
    !!(selectedSubjectId && selectedClassId && institutionId) && studentsReadFor !== studentsKey;

  // ── Load enrolled students whenever subject+class changes ──
  useEffect(() => {
    setStudentsCopyAt(null);
    if (!selectedSubjectId || !selectedClassId || !institutionId) {
      setEnrolledStudents([]);
      return;
    }
    let current = true;
    fetchEnrolledStudents(institutionId, selectedSubjectId, selectedClassId)
      .then(
        (read) => {
          if (!current) return;
          studentsOnCopy.current = read.fromCopy;
          setEnrolledStudents(read.value);
          setStudentsCopyAt(read.savedAt);
        },
        onLoadError("the class's students", () => current && setEnrolledStudents([])),
      )
      .finally(() => current && setStudentsReadFor(studentsKey));
    return () => {
      current = false;
    };
  }, [selectedSubjectId, selectedClassId, institutionId, studentsRetry, studentsKey]);

  // ── Live query for saved docs in the current week ──
  useEffect(() => {
    setDocsCopyAt(null);
    if (!selectedSubjectId || !selectedClassId || !institutionId) { setSavedDocs([]); return; }
    return watchRegisters(
      subjectWeek(institutionId, selectedSubjectId, selectedClassId, weekStartISO, weekEnd),
      (read, fromServer) => {
        setSavedDocs(read.value);
        setDocsCopyAt(read.savedAt);
        if (fromServer && studentsOnCopy.current) setStudentsRetry((n) => n + 1);
      },
      onLoadError("this week's attendance"),
    );
  }, [selectedSubjectId, selectedClassId, institutionId, weekStartISO, weekEnd]);

  return { enrolledStudents, studentsLoading, savedDocs, copySavedAt: olderCopy(studentsCopyAt, docsCopyAt) };
}
