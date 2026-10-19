import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { isTeacherRole } from '@/lib/departmentRequirement';
import { LIST_STALE_MS } from '@/lib/queryPolicies';

// A user doc's shape varies by role (student/teacher/parent/admin fields
// mixed together on one collection) — consumers already narrow by `role`
// and cast individual fields themselves (see list/students, list/teachers,
// list/parents), so this stays untyped beyond `id` rather than fighting
// that existing pattern with a type that doesn't match every role.
export type InstitutionUserDoc = { id: string } & Record<string, unknown>;

// Phase 2 pilot (docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md §4):
// replaces the identical, independent `onSnapshot(users where institutionId==)`
// listeners previously duplicated across the Students/Teachers/Parents list
// pages with one shared, cached query. Consumers filter by `role`
// client-side, same as before.
//
// A teacher may read student profiles only (firestore.rules, match /users/{uid}), and Firestore
// refuses a query that could return any other profile, in full. So a teacher asks for the students
// alone (its own cache key, still under ['users', institutionId] so invalidating that prefix covers
// both). Asking for every user of the institution was refused for a teacher: their Students list
// was always empty, and nothing said why.
export function useInstitutionUsers({ enabled = true }: { enabled?: boolean } = {}) {
  const { institutionId, role } = useAuth();
  const studentsOnly = isTeacherRole(role);
  return useQuery({
    queryKey: studentsOnly ? ['users', institutionId, 'students'] : ['users', institutionId],
    queryFn: async (): Promise<InstitutionUserDoc[]> => {
      const constraints = [where('institutionId', '==', institutionId)];
      if (studentsOnly) constraints.push(where('role', '==', 'student'));
      const snap = await getDocs(query(collection(db, 'users'), ...constraints));
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    // Gated on DATA_MODE (not just USE_MOCK) so Blank mode also fires zero
    // Firestore reads, per the tri-state contract (docs/FEATURE_FLAG_DATA_MODE.md).
    staleTime: LIST_STALE_MS,
    enabled: enabled && DATA_MODE === 'live' && !!institutionId && institutionId !== '*',
  });
}
