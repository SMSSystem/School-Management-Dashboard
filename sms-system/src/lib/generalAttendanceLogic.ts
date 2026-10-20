import type { AttendanceState } from '@/lib/attendanceStates';
import type { DraftRecord } from '@/lib/attendanceDraft';
import { isSchoolDay } from '@/lib/attendanceCalendar';
import { isSessionWindowClosed } from '@/lib/attendanceWindows';
import type { GeneralAttendanceDocument } from '@/types/attendance';
import type { NonSchoolDayDocument } from '@/types/institution';

// The General Attendance Register page's rules that need no screen or database (scenes/(dashboard)/
// attendance/general): dates and labels, which mark a cell shows, what a register saves, which sessions
// have something to save, and when a session is overdue or a cell is locked.

export type Session = 'AM' | 'PM';

export interface StudentRow {
  uid: string;
  name: string;
}

export type DraftKey = `${string}_${Session}`;
export type DraftStore = Record<DraftKey, Record<string, DraftRecord>>;

export type SavedRegister = GeneralAttendanceDocument & { id: string };

export function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

export function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export function formatDayLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

/** The key a session's draft and its buttons go by. */
export function sessionKey(dateISO: string, session: Session): DraftKey {
  return `${dateISO}_${session}`;
}

/**
 * The mark a student has for a (date, session): the draft entry if there is one, else whatever is
 * already saved for that student. Needed because a saved session's draft is cleared, and after a page
 * remount a single-cell edit leaves the draft holding just that one student, which would make every
 * other already-saved student look unmarked, both to the incomplete-save warning and to what a
 * non-merge setDoc writes.
 */
export function effectiveRecordOf(
  draft: DraftStore,
  savedDocs: SavedRegister[],
  dateISO: string,
  session: Session,
  studentUid: string,
): { state: AttendanceState; reason?: string } | undefined {
  const key = sessionKey(dateISO, session);
  const draftRecord = draft[key]?.[studentUid];
  if (draftRecord) return draftRecord;
  const saved = savedDocs.find((d) => d.date === dateISO && d.session === session)?.records[studentUid];
  return saved ? { state: saved.state, reason: saved.reason } : undefined;
}

/** The `records` a register saves: every marked student, with their name and any reason. */
export function buildRegisterRecords(
  students: StudentRow[],
  recordOf: (studentUid: string) => { state: AttendanceState; reason?: string } | undefined,
): GeneralAttendanceDocument['records'] {
  const records: GeneralAttendanceDocument['records'] = {};
  for (const student of students) {
    const r = recordOf(student.uid);
    if (r) {
      records[student.uid] = {
        state: r.state,
        studentName: student.name,
        ...(r.reason ? { reason: r.reason } : {}),
      };
    }
  }
  return records;
}

/** Every school-day session with something drafted, and how many students are still unmarked in it. */
export function populatedSessionsOf(
  schoolDays: string[],
  students: StudentRow[],
  sessionHasDraft: (key: DraftKey) => boolean,
  recordOf: (dateISO: string, session: Session, studentUid: string) => unknown,
): { dateISO: string; session: Session; emptyCount: number }[] {
  return schoolDays.flatMap((dateISO) =>
    (['AM', 'PM'] as Session[])
      .map((session) => {
        const key: DraftKey = sessionKey(dateISO, session);
        if (!sessionHasDraft(key)) return null;
        // recordOf (not the draft alone) — a session with even one post-remount draft entry would
        // otherwise report every other already-saved student as unmarked here too.
        const emptyCount = students.filter((s) => !recordOf(dateISO, session, s.uid)).length;
        return { dateISO, session, emptyCount };
      })
      .filter((s): s is { dateISO: string; session: Session; emptyCount: number } => s !== null),
  );
}

/**
 * A session whose window has closed and that has no submitted register. An earlier day's window closed
 * whatever the time is now; today's closes by the clock (the AM and PM closing times, Jamaica time).
 */
export function isOverdueSession(
  dateISO: string,
  session: Session,
  today: string,
  savedDocs: SavedRegister[],
  now = new Date(),
): boolean {
  if (dateISO > today) return false;
  if (dateISO === today && !isSessionWindowClosed(session, now)) return false;
  return !savedDocs.some((d) => d.date === dateISO && d.session === session && d.submittedAt);
}

/** A cell is locked in the future, with no academic year, and on a day that is not a school day. */
export function isCellDisabledOn(
  dateISO: string,
  today: string,
  effectiveYear: { schoolWeekDays: number[] } | null,
  nonSchoolDays: NonSchoolDayDocument[],
): boolean {
  if (dateISO > today) return true;
  if (!effectiveYear) return true;
  return !isSchoolDay(dateISO, effectiveYear.schoolWeekDays, nonSchoolDays);
}
