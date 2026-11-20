import { collection, deleteField, doc, getDoc, getDocs, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { recordsField, registerPatch, subjectRegisterId } from '@/lib/attendanceRegisters';
import { db } from '@/lib/firebase';
import { buildAuditEntry } from '@/lib/auditLog';
import { subjectAttendanceDetail } from '@/lib/teacherAudit';
import { institutionCollection, institutionDoc } from '@/lib/paths';
import { readClassSubjects, studentsTakingSubject } from '@/lib/studentClasses';
import { byName } from '@/lib/sortByName';
import type { StudentRow } from '@/lib/generalAttendanceLogic';
import type { SubjectAttendanceDoc } from '@/lib/subjectAttendanceLogic';
import { readThrough, type CopyRead } from '@/lib/offline/workingCopy';

// Every read and write of the Subject Attendance Register page that is not a live listener
// (scenes/(dashboard)/attendance/subject): who is enrolled in a subject for a class, and saving a register.
// The page keeps the checks before a save and the messages after it; the reads and the batch are moved as
// they were.

/** The students of a class who take a subject, sorted by name, with a working copy for staff (lib/offline/workingCopy.ts). */
export function fetchEnrolledStudents(
  institutionId: string,
  subjectId: string,
  classId: string,
): Promise<CopyRead<StudentRow[]>> {
  return readThrough(`subjectStudents:${institutionId}:${subjectId}:${classId}`, () =>
    readEnrolledStudents(institutionId, subjectId, classId),
  );
}

async function readEnrolledStudents(institutionId: string, subjectId: string, classId: string) {
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
  return { value: filtered, fromCache: studentsSnap.metadata.fromCache || enrollmentDoc.metadata.fromCache };
}

/** Saves one date's register for a subject and class, with its audit entry, in one batch. */
export async function saveSubjectRegister({
  institutionId,
  uid,
  performedByName,
  existingDocId,
  savedRecords,
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
  savedRecords: SubjectAttendanceDoc['records'] | undefined;
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  dateISO: string;
  termId: string;
  academicYearId: string;
  records: SubjectAttendanceDoc['records'];
}): Promise<void> {
  // A register saved before ids came from the register keeps its id until the migration script moves it.
  const docRef = institutionDoc(
    institutionId,
    'subjectAttendance',
    existingDocId ?? subjectRegisterId(subjectId, classId, dateISO),
  );
  const patch = registerPatch(savedRecords, records, deleteField());

  // The register and its audit entry in ONE batch, so a register is never
  // saved unrecorded.
  const batch = writeBatch(db);
  const register = {
    institutionId,
    subjectId,
    subjectName,
    classId,
    className,
    sessionDate: dateISO,
    teacherId: uid,
    termId,
    academicYearId,
    ...recordsField(patch, !existingDocId),
    submittedBy: uid,
    submittedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  batch.set(docRef, existingDocId ? register : { ...register, createdAt: serverTimestamp() }, { merge: true });
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
