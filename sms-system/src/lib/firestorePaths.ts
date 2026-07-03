import {
  collection,
  CollectionReference,
  doc,
  DocumentReference,
  Firestore,
} from 'firebase/firestore';

// ── Top-level (non-institution-scoped) ──────────────────────────────────────

export function userDoc(db: Firestore, userId: string): DocumentReference {
  return doc(db, 'users', userId);
}

export function userActivityCollection(db: Firestore, userId: string): CollectionReference {
  return collection(db, 'users', userId, 'activity_log');
}

export function userActivityDoc(db: Firestore, userId: string, eventId: string): DocumentReference {
  return doc(db, 'users', userId, 'activity_log', eventId);
}

export function institutionDoc(db: Firestore, institutionId: string): DocumentReference {
  return doc(db, 'institutions', institutionId);
}

export function institutionAuditLogCollection(db: Firestore, institutionId: string): CollectionReference {
  return collection(db, 'institutions', institutionId, 'audit_log');
}

export function institutionAuditLogDoc(
  db: Firestore,
  institutionId: string,
  eventId: string,
): DocumentReference {
  return doc(db, 'institutions', institutionId, 'audit_log', eventId);
}

// ── Institution subcollection helpers ───────────────────────────────────────

function instCol(
  db: Firestore,
  institutionId: string,
  col: string,
): CollectionReference {
  return collection(db, 'institutions', institutionId, col);
}

function instDoc(
  db: Firestore,
  institutionId: string,
  col: string,
  docId: string,
): DocumentReference {
  return doc(db, 'institutions', institutionId, col, docId);
}

// ── Members ─────────────────────────────────────────────────────────────────

export const memberCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'members');

export const memberDoc = (db: Firestore, iid: string, uid: string) =>
  instDoc(db, iid, 'members', uid);

// ── Classes ──────────────────────────────────────────────────────────────────

export const classCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'classes');

export const classDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'classes', id);

// ── Subjects ─────────────────────────────────────────────────────────────────

export const subjectCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'subjects');

export const subjectDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'subjects', id);

// ── Terms ────────────────────────────────────────────────────────────────────

export const termCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'terms');

export const termDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'terms', id);

// ── Academic Years ───────────────────────────────────────────────────────────

export const academicYearCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'academicYears');

export const academicYearDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'academicYears', id);

// ── Non-School Days ──────────────────────────────────────────────────────────

export const nonSchoolDayCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'nonSchoolDays');

export const nonSchoolDayDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'nonSchoolDays', id);

// ── Departments ──────────────────────────────────────────────────────────────

export const departmentCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'departments');

export const departmentDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'departments', id);

// ── Houses ───────────────────────────────────────────────────────────────────

export const houseCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'houses');

export const houseDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'houses', id);

// ── Results ──────────────────────────────────────────────────────────────────

export const resultCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'results');

export const resultDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'results', id);

// ── Feedback Comments ────────────────────────────────────────────────────────

export const feedbackCommentCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'feedbackComments');

export const feedbackCommentDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'feedbackComments', id);

// ── Gradebooks ───────────────────────────────────────────────────────────────

export const gradebookCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'gradebooks');

export const gradebookDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'gradebooks', id);

export const gradebookColumnCollection = (
  db: Firestore,
  iid: string,
  gradebookId: string,
) => collection(db, 'institutions', iid, 'gradebooks', gradebookId, 'columns');

export const gradebookColumnDoc = (
  db: Firestore,
  iid: string,
  gradebookId: string,
  colId: string,
) => doc(db, 'institutions', iid, 'gradebooks', gradebookId, 'columns', colId);

// ── General Attendance ────────────────────────────────────────────────────────

export const generalAttendanceCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'generalAttendance');

export const generalAttendanceDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'generalAttendance', id);

// ── Subject Attendance ────────────────────────────────────────────────────────

export const subjectAttendanceCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'subjectAttendance');

export const subjectAttendanceDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'subjectAttendance', id);

// ── Attendance Summaries ──────────────────────────────────────────────────────

export const attendanceSummaryCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'attendanceSummaries');

export const attendanceSummaryDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'attendanceSummaries', id);

// ── Subject Enrollments ───────────────────────────────────────────────────────

export const subjectEnrollmentCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'subjectEnrollments');

export const subjectEnrollmentDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'subjectEnrollments', id);

// ── Student-Parent Relationships ──────────────────────────────────────────────
// Doc ID format: {parentId}_{studentId}

export const studentParentCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'studentParents');

export const studentParentDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'studentParents', id);

// ── Report Cards ──────────────────────────────────────────────────────────────

export const reportCardCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'reportCards');

export const reportCardDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'reportCards', id);

// ── Report Card Comments ──────────────────────────────────────────────────────

export const reportCardCommentCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'reportCardComments');

export const reportCardCommentDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'reportCardComments', id);

// ── Student Activities ────────────────────────────────────────────────────────

export const studentActivityCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'studentActivities');

export const studentActivityDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'studentActivities', id);

// ── Student Responsibilities ──────────────────────────────────────────────────

export const studentResponsibilityCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'studentResponsibilities');

export const studentResponsibilityDoc = (
  db: Firestore,
  iid: string,
  id: string,
) => instDoc(db, iid, 'studentResponsibilities', id);

// ── Timetable Slots ───────────────────────────────────────────────────────────

export const timetableSlotCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'timetableSlots');

export const timetableSlotDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'timetableSlots', id);

// ── Announcements ─────────────────────────────────────────────────────────────

export const announcementCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'announcements');

export const announcementDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'announcements', id);

// ── Events ────────────────────────────────────────────────────────────────────

export const eventCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'events');

export const eventDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'events', id);

// ── Lessons ───────────────────────────────────────────────────────────────────

export const lessonCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'lessons');

export const lessonDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'lessons', id);

// ── Exams ─────────────────────────────────────────────────────────────────────

export const examCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'exams');

export const examDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'exams', id);

// ── Assignments ───────────────────────────────────────────────────────────────

export const assignmentCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'assignments');

export const assignmentDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'assignments', id);

// ── Attendance (legacy per-student records) ───────────────────────────────────

export const attendanceCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'attendance');

export const attendanceDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'attendance', id);

// ── Teacher-Classes junction ──────────────────────────────────────────────────

export const teacherClassCollection = (db: Firestore, iid: string) =>
  instCol(db, iid, 'teacherClasses');

export const teacherClassDoc = (db: Firestore, iid: string, id: string) =>
  instDoc(db, iid, 'teacherClasses', id);
