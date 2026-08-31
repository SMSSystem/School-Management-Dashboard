import {
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import type { NonSchoolDayDocument } from '@/lib/firebase';
import { countExpectedSessions } from '@/lib/attendanceCalendar';
import { institutionCollection, institutionDoc } from '@/lib/paths';
import { ATTENDANCE_STATES, type AttendanceState } from '@/lib/attendanceStates';

const VALID_STATES = new Set<string>(ATTENDANCE_STATES);

export interface RebuildParams {
  classId: string;
  termId: string;
  academicYearId: string;
  institutionId: string;
  termStartDate: string;
  termEndDate: string;
  schoolWeekDays: number[];
  nonSchoolDays: NonSchoolDayDocument[];
}

/**
 * Fetches all generalAttendance docs for the given class+term, aggregates
 * per-student state counts, and upserts an attendanceSummaries document for
 * each student found. Returns the number of summary documents written.
 */
export async function rebuildSummariesForClass(params: RebuildParams): Promise<number> {
  const {
    classId, termId, academicYearId, institutionId,
    termStartDate, termEndDate, schoolWeekDays, nonSchoolDays,
  } = params;

  // Calendar-only baseline shared by every student in the class; a "B" mark
  // (DEV_NOTES Item 7.4) subtracts from this per-student below, since it's an
  // explicit "don't count this session against this student" choice rather
  // than a normal state.
  const classExpectedSessions = countExpectedSessions(
    termStartDate, termEndDate, schoolWeekDays, nonSchoolDays, 2,
  );

  const snap = await getDocs(
    query(
      institutionCollection(institutionId, 'generalAttendance'),
      where('classId', '==', classId),
      where('termId', '==', termId),
    ),
  );

  const studentCounts: Record<string, Record<AttendanceState, number>> = {};

  snap.docs.forEach((d) => {
    const records = d.data().records as Record<string, { state: string }> | undefined;
    if (!records) return;
    Object.entries(records).forEach(([studentId, rec]) => {
      if (!studentCounts[studentId]) {
        studentCounts[studentId] = { P: 0, A: 0, L: 0, S: 0, E: 0, B: 0 };
      }
      const state = rec.state;
      if (VALID_STATES.has(state)) {
        studentCounts[studentId][state as AttendanceState]++;
      }
    });
  });

  const entries = Object.entries(studentCounts);
  if (entries.length === 0) return 0;

  await Promise.all(
    entries.map(([studentId, counts]) => {
      const totalExpectedSessions = Math.max(0, classExpectedSessions - counts.B);
      const sessionsAbsent = counts.A + counts.S + counts.E;
      const filledSessions = counts.P + counts.A + counts.L + counts.S + counts.E + counts.B;
      const attendanceRate =
        totalExpectedSessions > 0
          ? ((counts.P + counts.L) / totalExpectedSessions) * 100
          : 0;

      return setDoc(
        institutionDoc(institutionId, 'attendanceSummaries', `${studentId}_${termId}`),
        {
          studentId,
          termId,
          academicYearId,
          institutionId,
          classId,
          P: counts.P,
          A: counts.A,
          L: counts.L,
          S: counts.S,
          E: counts.E,
          B: counts.B,
          totalExpectedSessions,
          filledSessions,
          sessionsAbsent,
          daysLate: counts.L,
          attendanceRate,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    }),
  );

  return entries.length;
}
