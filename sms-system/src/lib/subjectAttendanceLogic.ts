import type { DraftRecord } from '@/lib/attendanceDraft';
import { isSchoolDay, isFortnightlySessionDay } from '@/lib/attendanceCalendar';
import type { StudentRow } from '@/lib/generalAttendanceLogic';
import type { SubjectDocument, NonSchoolDayDocument } from '@/lib/firebase';

// The Subject Attendance Register page's rules that need no screen or database (scenes/(dashboard)/
// attendance/subject): which dates a subject meets, when a session is overdue, which mark a student has for a
// date, what a register saves, and which classes the page offers for a subject. The date helpers it also uses
// (toISO, getWeekStart, addDays, formatDateLabel, formatDayLabel) are the General Attendance Register's, in
// lib/generalAttendanceLogic.ts.

export interface SubjectAttendanceDoc {
  id: string;
  sessionDate: string;
  submittedAt: unknown;
  records: Record<string, { state: string; studentName: string; reason?: string }>;
}

export function isSubjectSessionDay(
  dateStr: string,
  subject: SubjectDocument,
  termStartDate: string,
  schoolWeekDays: number[],
  nonSchoolDays: NonSchoolDayDocument[],
): boolean {
  if (!isSchoolDay(dateStr, schoolWeekDays, nonSchoolDays)) return false;
  if (subject.frequency === 'custom') {
    return (subject.customFrequencyDays ?? []).includes(dateStr);
  }
  const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  if (!(subject.sessionDayOfWeek ?? []).includes(dayOfWeek)) return false;
  if (subject.frequency === 'fortnightly') {
    return isFortnightlySessionDay(dateStr, termStartDate, subject.fortnightlyOffset ?? 0);
  }
  return true;
}

/**
 * An earlier date is overdue unless its register was saved; today is overdue only from 15:00 Jamaica time
 * (UTC-5, so 20:00 UTC) and still unsaved; a later date never is.
 */
export function isOverdueDate(
  dateStr: string,
  today: string,
  savedDates: Set<string>,
  now: Date = new Date(),
): boolean {
  if (dateStr > today) return false;
  if (dateStr < today) return !savedDates.has(dateStr);
  // Today: past 15:00 JST (UTC−5 = 20:00 UTC)
  const nowJST = new Date(now.getTime() - 5 * 60 * 60 * 1000);
  return nowJST.getUTCHours() >= 15 && !savedDates.has(dateStr);
}

/** The dates of the week the subject meets on. */
export function sessionDatesOf(
  weekDates: string[],
  subject: SubjectDocument | null,
  year: { schoolWeekDays: number[] } | null,
  termStart: string,
  nonSchoolDays: NonSchoolDayDocument[],
): string[] {
  return subject && year
    ? weekDates.filter((d) =>
        isSubjectSessionDay(d, subject, termStart, year.schoolWeekDays, nonSchoolDays)
      )
    : [];
}

/**
 * The mark a student has for a date: the in-memory draft entry if one exists, else whatever is already
 * saved for that student.
 */
export function effectiveRecordOf(
  draft: Record<string, Record<string, DraftRecord>>,
  savedDocs: SubjectAttendanceDoc[],
  dateISO: string,
  studentUid: string,
): { state: string; reason?: string } | undefined {
  const draftRecord = draft[dateISO]?.[studentUid];
  if (draftRecord) return draftRecord;
  const saved = savedDocs.find((d) => d.sessionDate === dateISO)?.records[studentUid];
  return saved ? { state: saved.state, reason: saved.reason } : undefined;
}

/** The `records` map a register is saved with: every student who has a mark, with the reason only when there is one. */
export function buildSubjectRecords(
  enrolledStudents: StudentRow[],
  recordOf: (studentUid: string) => { state: string; reason?: string } | undefined,
): SubjectAttendanceDoc['records'] {
  const records: SubjectAttendanceDoc['records'] = {};
  for (const student of enrolledStudents) {
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

/**
 * The classes the page offers for a subject: every class for an institution-wide subject, otherwise the
 * subject's own; in custom mode further narrowed to the selected time block, since every class carries its
 * own termId (§3.2).
 */
export function classesForSubjectDropdown<C extends { id: string; termId?: string }>(
  subject: SubjectDocument | null,
  allClasses: C[],
  isCustomMode: boolean,
  selectedBlock: { term: { id: string } } | null,
): C[] {
  return (
    subject?.classScope === 'institution'
      ? allClasses
      : allClasses.filter((c) => subject?.classIds.includes(c.id) ?? false)
  ).filter((c) => !isCustomMode || !selectedBlock || c.termId === selectedBlock.term.id);
}

/** The class picker shows only when the subject has more than one class to choose from. */
export function needsClassSelector(subject: SubjectDocument | null): boolean {
  return !!subject && (subject.classScope === 'institution' || subject.classIds.length > 1);
}
