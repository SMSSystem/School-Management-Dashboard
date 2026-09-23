import { useQuery } from '@tanstack/react-query';
import { getDocs, query, where } from 'firebase/firestore';
import { institutionCollection } from '@/lib/paths';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import type { Role, SubjectDocument } from '@/lib/firebase';

export type InstitutionSubject = SubjectDocument & { id: string };

// CORRECTION to the spec's original §7.2 claim: verified directly against
// firestore.rules (both the flat /subjects/{id} rule, line ~301, and the
// nested /institutions/{institutionId}/subjects/{id} rule the app actually
// queries, line ~935) — the `subjects` read rule is
// `isSignedIn() && inMyInstitution(institutionId)` with NO role-dependent
// clause, unlike `users`' teacher clause. An unfiltered subjects query from
// a regular_teacher is permitted by the rule; it is never rejected. The
// teacherIds array-contains filter used throughout the codebase (Result/
// FeedbackComment/Assignment/Exam forms, Gradebook, list/results' filter
// dropdown) is a data-minimization/UX choice — "only show subjects I
// teach" — not a security necessity. This hook's role-branching preserves
// that existing UX (matching what those consumers already did before
// conversion) rather than dropping it, but a caller that genuinely needs
// every subject regardless of viewer role (list/results' name-lookup
// listener, TeacherForm's assignment checklist, dropdowns that must resolve
// any subject's name) should use useAllInstitutionSubjects() below instead.
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
// still share its cache entry rather than re-reading independently. Pass
// role: null to force the unfiltered shape regardless of the actual caller
// (matches useAllInstitutionSubjects() below), since the rule permits it.
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

// For consumers that need every subject in the institution regardless of the
// viewer's own role — resolving any subject's name for display, or an
// admin-only "assign subjects to this specific teacher" checklist — not
// "subjects I teach." Shares the same unfiltered cache entry
// (["subjects", institutionId]) that useInstitutionSubjects() already
// produces for every non-regular_teacher caller.
export function useAllInstitutionSubjects() {
  const { institutionId } = useAuth();
  return useQuery({
    queryKey: subjectsQueryKey(institutionId ?? '', null, undefined),
    queryFn: () => fetchSubjects(institutionId as string, null, undefined),
    enabled: DATA_MODE === 'live' && !!institutionId && institutionId !== '*',
  });
}
