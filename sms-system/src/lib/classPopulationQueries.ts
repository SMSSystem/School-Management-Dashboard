// Per-class student head-count for the Classes list, read with count()
// aggregations (billed 1 read per 1,000 index entries, minimum 1; no documents or
// personal data reach the browser). Equality and array-contains filters only, so
// the existing single-field indexes serve them (index merging, probed on the live
// project as admin and teacher), and the query is provable under the teacher
// users-read rule (`institutionId == `, `role == 'student'`).
//
// Six aggregations per class: all students, Male and Female, and the deactivated ones of each,
// because `status != 'inactive'` would drop users that have no `status` field (see
// activePopulation() in classPopulation.ts). Students with no gender are the remainder.

import { collection, getCountFromServer, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import { db } from './firebase';
import { activeGenderCounts, type GenderCounts } from './classPopulation';
import { institutionDoc } from './paths';

export async function fetchClassPopulation(institutionId: string, classId: string): Promise<GenderCounts> {
  const students = [
    where('institutionId', '==', institutionId),
    where('role', '==', 'student'),
    // every student of the class, home or additional (see lib/studentClasses.ts)
    where('classIds', 'array-contains', classId),
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

/**
 * Recounts the given classes with the six aggregations each and stores the result on the class documents (population
 * and populationBaseline, lib/classPopulationDelta.ts), in batches of 400: from then on the Classes list reads them from the
 * documents. Writes the true numbers over whatever increments the writers have made since the last count. Returns how
 * many classes were written.
 */
export async function recountClassPopulations(institutionId: string, classIds: string[]): Promise<number> {
  const counted = await Promise.all(classIds.map(async (id) => ({ id, counts: await fetchClassPopulation(institutionId, id) })));
  for (let i = 0; i < counted.length; i += 400) {
    const batch = writeBatch(db);
    for (const { id, counts } of counted.slice(i, i + 400)) {
      batch.update(institutionDoc(institutionId, 'classes', id), {
        population: { male: counts.male, female: counts.female, unspecified: counts.unspecified },
        populationBaseline: serverTimestamp(),
      });
    }
    await batch.commit();
  }
  return counted.length;
}
