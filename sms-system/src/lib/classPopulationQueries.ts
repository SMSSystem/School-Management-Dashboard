// Per-class student head-count for the Classes list, read with count()
// aggregations (billed 1 read per 1,000 index entries, minimum 1; no documents or
// personal data reach the browser). Equality filters only, so the existing
// single-field indexes serve them, and the query is provable under the teacher
// users-read rule (`institutionId == `, `role == 'student'`).
//
// Six aggregations per class: all students, Male and Female, and the deactivated ones of each,
// because `status != 'inactive'` would drop users that have no `status` field (see
// activePopulation() in classPopulation.ts). Students with no gender are the remainder.

import { collection, getCountFromServer, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { activeGenderCounts, type GenderCounts } from './classPopulation';

export async function fetchClassPopulation(institutionId: string, classId: string): Promise<GenderCounts> {
  const students = [
    where('institutionId', '==', institutionId),
    where('role', '==', 'student'),
    where('classId', '==', classId),
  ];
  const users = collection(db, 'users');
  const count = async (...extra: ReturnType<typeof where>[]) =>
    (await getCountFromServer(query(users, ...students, ...extra))).data().count;
  const inactive = where('status', '==', 'inactive');
  const [total, totalInactive, male, maleInactive, female, femaleInactive] = await Promise.all([
    count(),
    count(inactive),
    count(where('gender', '==', 'Male')),
    count(where('gender', '==', 'Male'), inactive),
    count(where('gender', '==', 'Female')),
    count(where('gender', '==', 'Female'), inactive),
  ]);
  return activeGenderCounts({ total, inactive: totalInactive, male, maleInactive, female, femaleInactive });
}
