import { useEffect, useRef, useState } from "react";
import { onLoadError } from "@/lib/reportError";
import { loadClassStudents } from "@/lib/generalAttendanceSave";
import {
  generalWeek,
  watchRegisters,
  type GeneralRegister,
} from "@/lib/offline/registerReads";
import { olderCopy } from "@/lib/offline/workingCopy";
import type { StudentRow } from "@/lib/generalAttendanceLogic";

// What the General Attendance Register page (scenes/(dashboard)/attendance/general) reads for the chosen class:
// its students, and the registers already saved for the week shown. Offline, both come from the working copies
// saved the last time they were read (lib/offline/registerReads.ts); copySavedAt says when. Back online, the week's
// listener hears the server first; the students are then read again, so the copy notice goes without leaving the page.
// studentsLoading lets the page say it's loading rather than that the class is empty while the first read runs.
export function useGeneralRegisterReads(
  institutionId: string | null | undefined,
  classId: string,
  weekStartISO: string,
  weekEnd: string,
) {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [studentsCopyAt, setStudentsCopyAt] = useState<number | null>(null);
  const [savedDocs, setSavedDocs] = useState<GeneralRegister[]>([]);
  const [docsCopyAt, setDocsCopyAt] = useState<number | null>(null);
  const studentsOnCopy = useRef(false);
  const [studentsRetry, setStudentsRetry] = useState(0);
  const [studentsLoading, setStudentsLoading] = useState(true);

  // ── Load students for the selected class ──
  useEffect(() => {
    setStudentsCopyAt(null);
    if (!classId) {
      setStudents([]);
      setStudentsLoading(false);
      return;
    }
    setStudentsLoading(true);
    let current = true;
    loadClassStudents(institutionId ?? null, classId)
      .then(
        (read) => {
          if (!current) return;
          studentsOnCopy.current = read.fromCopy;
          setStudents(read.value);
          setStudentsCopyAt(read.savedAt);
        },
        onLoadError("the class's students", () => current && setStudents([])),
      )
      .finally(() => current && setStudentsLoading(false));
    return () => {
      current = false;
    };
  }, [classId, institutionId, studentsRetry]);

  // ── Live query for saved documents in the current week ──
  useEffect(() => {
    setDocsCopyAt(null);
    if (!classId || !institutionId) return;
    return watchRegisters(
      generalWeek(institutionId, classId, weekStartISO, weekEnd),
      (read, fromServer) => {
        setSavedDocs(read.value);
        setDocsCopyAt(read.savedAt);
        if (fromServer && studentsOnCopy.current)
          setStudentsRetry((n) => n + 1);
      },
      onLoadError("this week's attendance"),
    );
  }, [classId, institutionId, weekStartISO, weekEnd]);

  return {
    students,
    studentsLoading,
    savedDocs,
    copySavedAt: olderCopy(studentsCopyAt, docsCopyAt),
  };
}
