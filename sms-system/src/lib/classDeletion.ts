import { collection, doc, getCountFromServer, getDocs, query, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { withoutExtraClass, type ClassMembership } from './studentClasses';

// Deleting a class must not leave students pointing at it as an ADDITIONAL class (lib/studentClasses.ts):
// the id is removed from their `classIds` and `classSubjects`. A student whose HOME class is deleted keeps
// that id, as before this feature (the class list then shows a dash for it).

const studentsOf = (institutionId: string, classId: string) =>
  query(
    collection(db, 'users'),
    where('institutionId', '==', institutionId),
    where('role', '==', 'student'),
    where('classIds', 'array-contains', classId),
  );

/** How many students have the class as an additional class: everyone in it, less those whose home class it is. Two count() reads. */
export async function countAdditionalClassStudents(institutionId: string, classId: string): Promise<number> {
  const [all, home] = await Promise.all([
    getCountFromServer(studentsOf(institutionId, classId)),
    getCountFromServer(
      query(
        collection(db, 'users'),
        where('institutionId', '==', institutionId),
        where('role', '==', 'student'),
        where('classId', '==', classId),
      ),
    ),
  ]);
  return Math.max(0, all.data().count - home.data().count);
}

const BATCH_SIZE = 400; // a batch holds at most 500 writes

/** Takes the class out of every student who has it as an additional class; returns how many were changed. */
export async function removeClassFromStudents(institutionId: string, classId: string): Promise<number> {
  const snap = await getDocs(studentsOf(institutionId, classId));
  const extras = snap.docs.filter((d) => d.data().classId !== classId);
  for (let i = 0; i < extras.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const d of extras.slice(i, i + BATCH_SIZE)) {
      const next = withoutExtraClass(d.data() as ClassMembership, classId);
      batch.update(doc(db, 'users', d.id), { classIds: next.classIds, classSubjects: next.classSubjects });
    }
    await batch.commit();
  }
  return extras.length;
}
