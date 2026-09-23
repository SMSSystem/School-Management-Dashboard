import { useQuery } from '@tanstack/react-query';
import { getDocs, query, where } from 'firebase/firestore';
import { institutionCollection } from '@/lib/paths';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import type { Role, SubjectDocument } from '@/lib/firebase';

export type InstitutionSubject = SubjectDocument & { id: string };

// "Security rules are not filters" (spec §7.1): the `subjects` read rule's
// regular_teacher clause depends on `resource.data.teacherIds`, so an
// unfiltered query from a regular_teacher caller gets the ENTIRE request
// rejected, not a role-filtered result — where('teacherIds','array-contains',uid)
// must be in the query itself. Every other role (including senior_teacher)
// is permitted the unfiltered read (spec §7, §7.2) — some individual
// consumers (e.g. Gradebook) additionally narrow senior_teacher's *displayed*
// options client-side, but that's page-level UX, not a rule requirement, so
// it stays out of this shared hook's query shape.
function subjectsQueryKey(institutionId: string, role: Role | null, uid: string | undefined) {
  return role === 'regular_teacher' && uid
    ? (['subjects', institutionId, 'teacher', uid] as const)
    : (['subjects', institutionId] as const);
}

async function fetchSubjects(
  institutionId: string,
  role: Role | null,
  uid: string | undefined,
): Promise<InstitutionSubject[]> {
  const base = institutionCollection(institutionId, 'subjects');
  const ref = role === 'regular_teacher' && uid ? query(base, where('teacherIds', 'array-contains', uid)) : base;
  const snap = await getDocs(ref);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as SubjectDocument) }));
}

// Phase 3a reference-data hook (docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md
// §5.1, role-branching per §7.2).
export function useInstitutionSubjects() {
  const { institutionId, role, user } = useAuth();
  const uid = user?.uid;
  return useQuery({
    queryKey: subjectsQueryKey(institutionId ?? '', role, uid),
    queryFn: () => fetchSubjects(institutionId as string, role, uid),
    // Gated on DATA_MODE (not just USE_MOCK) so Blank mode also fires zero
    // Firestore reads, per the tri-state contract (docs/FEATURE_FLAG_DATA_MODE.md).
    enabled: DATA_MODE === 'live' && !!institutionId && institutionId !== '*',
  });
}

// For imperative (non-render-bound) consumers — click handlers, one-off
// maintenance-tool IIFEs — that can't call the hook directly but should
// still share its cache entry rather than re-reading independently.
export function fetchInstitutionSubjects(
  institutionId: string,
  role: Role | null,
  uid: string | undefined,
): Promise<InstitutionSubject[]> {
  return queryClient.fetchQuery({
    queryKey: subjectsQueryKey(institutionId, role, uid),
    queryFn: () => fetchSubjects(institutionId, role, uid),
  });
}
