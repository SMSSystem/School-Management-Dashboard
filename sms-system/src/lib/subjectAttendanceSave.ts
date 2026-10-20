import { collection, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { buildAuditEntry } from '@/lib/auditLog';
import { subjectAttendanceDetail } from '@/lib/teacherAudit';
import { institutionCollection, institutionDoc } from '@/lib/paths';
import { readClassSubjects, studentsTakingSubject } from '@/lib/studentClasses';
import { byName } from '@/lib/sortByName';
import type { StudentRow } from '@/lib/generalAttendanceLogic';
import type { SubjectAttendanceDoc } from '@/lib/subjectAttendanceLogic';

// Every read and write of the Subject Attendance Register page that is not a live listener
// (scenes/(dashboard)/attendance/subject): who is enrolled in a subject for a class, and saving a register.
// The page keeps the checks before a save and the messages after it; the reads and the batch are moved as
// they were.

/** The students of a class who take a subject, sorted by name. */
export async function fetchEnrolledStudents(institutionId: string, subjectId: string, classId: string): Promise<StudentRow[]> {
  const [studentsSnap, enrollmentDoc] = await Promise.all([
    getDocs(
      query(
        collection(db, 'users'),
        where('institutionId', '==', institutionId),
        where('role', '==', 'student'),
        // everyone in the class, home or additional (lib/studentClasses.ts)
        where('classIds', 'array-contains', classId),
      )
    ),
    getDoc(institutionDoc(institutionId, 'subjectEnrollments', `${subjectId}_${classId}`)),
  ]);
  const allStudents = studentsSnap.docs.map((d) => ({
    uid: d.id,
    name: (d.data().name as string) ?? d.id,
    classId: (d.data().classId as string | null | undefined) ?? null,
    classIds: d.data().classIds as string[] | undefined,
    classSubjects: readClassSubjects(d.data().classSubjects),
  }));

  // The subject's own excluded list for this class, then each student's chosen subjects for it.
  const enrollment = enrollmentDoc.exists() ? enrollmentDoc.data() : null;
  const excluded = enrollment?.enrollmentType === 'selective' ? ((enrollment.excludedStudentIds as string[]) ?? []) : [];
  const filtered: StudentRow[] = studentsTakingSubject(allStudents, classId, subjectId, excluded).map(
    ({ uid, name }) => ({ uid, name }),
  );
  filtered.sort(byName((s: StudentRow) => s.name));
  return filtered;
}

/** Saves one date's register for a subject and class, with its audit entry, in one batch. */
export async function saveSubjectRegister({
  institutionId,
  uid,
  performedByName,
  existingDocId,
  subjectId,
  subjectName,
  classId,
  className,
  dateISO,
  termId,
  academicYearId,
  records,
}: {
  institutionId: string;
  uid: string;
  performedByName: string;
  existingDocId: string | null;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  dateISO: string;
  termId: string;
  academicYearId: string;
  records: SubjectAttendanceDoc['records'];
}): Promise<void> {
  const docRef = existingDocId
    ? institutionDoc(institutionId, 'subjectAttendance', existingDocId)
    : doc(institutionCollection(institutionId, 'subjectAttendance'));

  // The register and its audit entry in ONE batch, so a register is never
  // saved unrecorded.
  const batch = writeBatch(db);
  batch.set(docRef, {
    institutionId,
    subjectId,
    subjectName,
    classId,
    className,
    sessionDate: dateISO,
    teacherId: uid,
    termId,
    academicYearId,
    records,
    submittedBy: uid,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...(!existingDocId ? { createdAt: serverTimestamp() } : {}),
  });
  if (institutionId !== '*') {
    batch.set(
      doc(institutionCollection(institutionId, 'audit_log')),
      buildAuditEntry({
        institutionId,
        eventType: 'attendance_edit',
        detail: subjectAttendanceDetail({
          className,
          subjectName,
          dateISO,
          recorded: Object.keys(records).length,
        }),
        targetUid: classId,
        targetName: className,
        performedBy: uid,
        performedByName,
      }),
    );
  }
  await batch.commit();
}
