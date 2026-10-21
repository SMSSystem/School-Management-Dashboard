import { doc, getDoc, getDocs, query, where, type DocumentReference } from 'firebase/firestore';
import { db } from './firebase';
import { institutionCollection, institutionSubdoc } from './paths';
import { classIdsOf } from './studentClasses';
import { STUDENT_EXAM_RECORDS } from './deleteUserData';

// The online-exam records of one student, for "Delete user" (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §10): the
// attempt, the grade and the extra-time entry sit in subcollections of each exam under the student's uid, so a query on
// studentId does not find them. They are looked up for the online exams of the classes the student is in now (two
// equality filters, no composite index; one read per exam found and one per record). Exams of a class the student has
// since left are not found: there is no collection-group rule or index for it (docs/ISSUES_AND_GAPS.md).

export type StudentExamRecord = { ref: DocumentReference; label: string };

export async function findStudentExamRecords(institutionId: string, uid: string): Promise<StudentExamRecord[]> {
  const student = await getDoc(doc(db, 'users', uid));
  const classIds = student.exists() ? classIdsOf(student.data()) : [];
  const exams = await Promise.all(
    classIds.map((classId) =>
      getDocs(query(institutionCollection(institutionId, 'exams'), where('classId', '==', classId), where('online', '==', true))),
    ),
  );
  const found: StudentExamRecord[] = [];
  await Promise.all(
    exams.flatMap((snap) =>
      snap.docs.flatMap((exam) =>
        STUDENT_EXAM_RECORDS.map(async (record) => {
          const ref = institutionSubdoc(institutionId, 'exams', exam.id, record.collection, uid);
          if ((await getDoc(ref)).exists()) found.push({ ref, label: record.label });
        }),
      ),
    ),
  );
  return found;
}
