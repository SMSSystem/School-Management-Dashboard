import {
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { NonSchoolDayDocument } from '@/lib/firebase';
import { countExpectedSessions } from '@/lib/attendanceCalendar';

type AttendanceState = 'P' | 'A' | 'L' | 'S' | 'E';

const VALID_STATES = new Set<string>(['P', 'A', 'L', 'S', 'E']);

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

  const totalExpectedSessions = countExpectedSessions(
    termStartDate, termEndDate, schoolWeekDays, nonSchoolDays, 2,
  );

  const snap = await getDocs(
    query(
      collection(db, 'generalAttendance'),
      where('institutionId', '==', institutionId),
      where('classId', '==', classId),
      where('termId', '==', termId),
    ),
  );

  const studentCounts: Record<string, { P: number; A: number; L: number; S: number; E: number }> = {};

  snap.docs.forEach((d) => {
    const records = d.data().records as Record<string, { state: string }> | undefined;
    if (!records) return;
    Object.entries(records).forEach(([studentId, rec]) => {
      if (!studentCounts[studentId]) {
        studentCounts[studentId] = { P: 0, A: 0, L: 0, S: 0, E: 0 };
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
      const sessionsAbsent = counts.A + counts.S + counts.E;
      const filledSessions = counts.P + counts.A + counts.L + counts.S + counts.E;
      const attendanceRate =
        totalExpectedSessions > 0
          ? ((counts.P + counts.L) / totalExpectedSessions) * 100
          : 0;

      return setDoc(
        doc(db, 'attendanceSummaries', `${studentId}_${termId}`),
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
