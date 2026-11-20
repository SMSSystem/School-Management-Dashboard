// After an online sign-in, reads today's registers in the background so they open even if the connection drops
// before the teacher gets to them (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice B). Only today's:
// a senior teacher's homeroom, and each subject class a regular teacher has a session with today. A subject taught
// to the whole institution is skipped (too many classes); it gets its copy when opened. Once a day per device, one read
// at a time, and it stops at the first sign of being offline. Costs about one read per student per register. The
// register pages' code is loaded by the sidebar (components/Menu.tsx).

import type { Role } from "@/types/people";
import { fetchInstitutionSubjects } from "@/lib/subjectsQuery";
import { addDays, getWeekStart, toISO } from "@/lib/generalAttendanceLogic";
import { loadClassStudents } from "@/lib/generalAttendanceSave";
import { fetchEnrolledStudents } from "@/lib/subjectAttendanceSave";
import { generalWeek, keepWeek, subjectWeek } from "./registerReads";
import { keepCopy } from "./workingCopy";
import { PREFETCH_DONE_KEY } from "./offlineStore";
import {
  homeroomCopyName,
  homeroomOf,
  todaysSubjectClasses,
} from "./todaysRegisters";

// Once a day on each device, not once per tab: a new tab, or a phone that drops the tab, would otherwise read
// today's registers again. The copies are kept on the device, so the first run of the day is enough.
function doneToday(uid: string, today: string): boolean {
  try {
    return localStorage.getItem(PREFETCH_DONE_KEY) === `${uid}:${today}`;
  } catch {
    return false;
  }
}

function markDone(uid: string, today: string): void {
  try {
    localStorage.setItem(PREFETCH_DONE_KEY, `${uid}:${today}`);
  } catch {
    // Without storage it runs again at the next start, which costs reads but nothing else.
  }
}

/** Reads today's registers for a teacher and keeps their copies. Never throws. */
export async function prefetchRegisters({
  uid,
  role,
  institutionId,
  profile,
  now = new Date(),
}: {
  uid: string;
  role: Role;
  institutionId: string;
  profile: Record<string, unknown> | undefined;
  now?: Date;
}): Promise<void> {
  if (role !== "senior_teacher" && role !== "regular_teacher") return;
  const today = toISO(now);
  if (doneToday(uid, today)) return;
  const weekStart = getWeekStart(now);
  const from = toISO(weekStart);
  const to = toISO(addDays(weekStart, 6));
  try {
    if (role === "senior_teacher") {
      const homeroom = homeroomOf(profile);
      keepCopy(homeroomCopyName(uid), homeroom);
      if (homeroom.assignedClassId) {
        const students = await loadClassStudents(
          institutionId,
          homeroom.assignedClassId,
        );
        if (students.fromCopy) return;
        if (
          !(await keepWeek(
            generalWeek(institutionId, homeroom.assignedClassId, from, to),
          ))
        )
          return;
      }
    } else {
      const subjects = await fetchInstitutionSubjects(institutionId, role, uid);
      for (const { subjectId, classId } of todaysSubjectClasses(
        subjects,
        today,
      )) {
        const students = await fetchEnrolledStudents(
          institutionId,
          subjectId,
          classId,
        );
        if (students.fromCopy) return;
        if (
          !(await keepWeek(
            subjectWeek(institutionId, subjectId, classId, from, to),
          ))
        )
          return;
      }
    }
    markDone(uid, today);
  } catch {
    // Offline or refused: the pages read what they can when opened.
  }
}
