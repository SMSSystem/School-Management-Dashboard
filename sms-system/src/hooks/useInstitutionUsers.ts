import { useQuery } from '@tanstack/react-query';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';

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
export function useInstitutionUsers() {
  const { institutionId } = useAuth();
  return useQuery({
    queryKey: ['users', institutionId],
    queryFn: async (): Promise<InstitutionUserDoc[]> => {
      const snap = await getDocs(
        query(collection(db, 'users'), where('institutionId', '==', institutionId)),
      );
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    },
    // Mirrors the `if (USE_MOCK || !institutionId || institutionId === '*') return;`
    // guard already used at every one of these call sites today.
    enabled: !USE_MOCK && !!institutionId && institutionId !== '*',
  });
}
