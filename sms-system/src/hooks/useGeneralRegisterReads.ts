import { useEffect, useState } from "react";
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
// saved the last time they were read (lib/offline/registerReads.ts); copySavedAt says when.
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

  // ── Load students for the selected class ──
  useEffect(() => {
    setStudentsCopyAt(null);
    if (!classId) {
      setStudents([]);
      return;
    }
    let current = true;
    loadClassStudents(institutionId ?? null, classId).then(
      (read) => {
        if (!current) return;
        setStudents(read.value);
        setStudentsCopyAt(read.savedAt);
      },
      onLoadError("the class's students", () => current && setStudents([])),
    );
    return () => {
      current = false;
    };
  }, [classId, institutionId]);

  // ── Live query for saved documents in the current week ──
  useEffect(() => {
    setDocsCopyAt(null);
    if (!classId || !institutionId) return;
    return watchRegisters(
      generalWeek(institutionId, classId, weekStartISO, weekEnd),
      (read) => {
        setSavedDocs(read.value);
        setDocsCopyAt(read.savedAt);
      },
      onLoadError("this week's attendance"),
    );
  }, [classId, institutionId, weekStartISO, weekEnd]);

  return {
    students,
    savedDocs,
    copySavedAt: olderCopy(studentsCopyAt, docsCopyAt),
  };
}
