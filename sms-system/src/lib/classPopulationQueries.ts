// Per-class student head-count for the Classes list, read with count()
// aggregations (billed 1 read per 1,000 index entries, minimum 1; no documents or
// personal data reach the browser). Equality filters only, so the existing
// single-field indexes serve them, and the query is provable under the teacher
// users-read rule (`institutionId == `, `role == 'student'`).
//
// Two aggregations per class (all students, deactivated students) because
// `status != 'inactive'` would drop users that have no `status` field; see
// activePopulation() in classPopulation.ts.

import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { activePopulation } from './classPopulation';

export async function fetchClassPopulation(institutionId: string, classId: string): Promise<number> {
  const students = [
    where('institutionId', '==', institutionId),
    where('role', '==', 'student'),
    where('classId', '==', classId),
  ];
  const users = collection(db, 'users');
  const [total, inactive] = await Promise.all([
    getCountFromServer(query(users, ...students)),
    getCountFromServer(query(users, ...students, where('status', '==', 'inactive'))),
  ]);
  return activePopulation(total.data().count, inactive.data().count);
}
