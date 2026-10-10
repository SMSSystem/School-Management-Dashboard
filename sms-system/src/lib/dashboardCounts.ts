// Head-counts for the admin / spectator dashboard (Students, Teachers, Parents,
// Classes cards and the student gender chart).
//
// These used to be live `onSnapshot` listeners on `users where institutionId ==
// and role ==`, downloading every student, teacher and parent document (PII
// included) only to read `snap.size` or one field. Firestore bills one read per
// document delivered, so a cold dashboard cost roughly N_students + N_teachers +
// N_parents reads (~6,000 at 2,500 students) against Spark's 50,000/day pooled
// across every institution — and with the SDK cache now memory-only, a reload
// repeats it in full.
//
// `getCountFromServer` is an aggregation: it is billed one read per 1,000 index
// entries (minimum one) and no documents reach the client or its cache. Only
// equality filters are used, so the existing single-field indexes serve them.
// Pure parts (key, gender maths) are in dashboardCountsLogic.ts.

import { collection, getCountFromServer, query, where, type Query } from 'firebase/firestore';
import { db } from './firebase';
import { institutionCollection } from './paths';
import type { DashboardCountKind, StudentGenderCounts } from './dashboardCountsLogic';

export function roleCountQuery(institutionId: string, kind: DashboardCountKind): Query {
  const users = collection(db, 'users');
  switch (kind) {
    case 'student':
      return query(users, where('institutionId', '==', institutionId), where('role', '==', 'student'));
    case 'teacher':
      return query(
        users,
        where('institutionId', '==', institutionId),
        where('role', 'in', ['regular_teacher', 'senior_teacher']),
      );
    case 'parent':
      return query(users, where('institutionId', '==', institutionId), where('role', '==', 'parent'));
    case 'class':
      return institutionCollection(institutionId, 'classes');
  }
}

async function countOf(q: Query): Promise<number> {
  const snap = await getCountFromServer(q);
  return snap.data().count;
}

export function fetchRoleCount(institutionId: string, kind: DashboardCountKind): Promise<number> {
  return countOf(roleCountQuery(institutionId, kind));
}

/** Three aggregations (total, Female, Male); anything else is "unknown". */
export async function fetchStudentGenderCounts(institutionId: string): Promise<StudentGenderCounts> {
  const students = (gender?: 'Male' | 'Female') => {
    const base = [where('institutionId', '==', institutionId), where('role', '==', 'student')];
    return query(collection(db, 'users'), ...(gender ? [...base, where('gender', '==', gender)] : base));
  };
  const [total, male, female] = await Promise.all([
    countOf(students()),
    countOf(students('Male')),
    countOf(students('Female')),
  ]);
  return { total, male, female };
}
