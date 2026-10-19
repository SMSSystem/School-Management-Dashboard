import { useQuery } from '@tanstack/react-query';
import { getDocs } from 'firebase/firestore';
import { institutionCollection } from '@/lib/paths';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import type { ClassDocument } from '@/lib/firebase';
import { REFERENCE_STALE_MS } from '@/lib/queryPolicies';

export type InstitutionClass = ClassDocument & { id: string };

function classesQueryKey(institutionId: string) {
  return ['classes', institutionId] as const;
}

async function fetchClasses(institutionId: string): Promise<InstitutionClass[]> {
  const snap = await getDocs(institutionCollection(institutionId, 'classes'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ClassDocument) }));
}

// Phase 3a reference-data hook (docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md
// §5.1): collapses every unfiltered per-file classes dropdown/reference read
// into one shared, cached query. No role branching needed — the `classes`
// read rule is role-agnostic for any same-institution signed-in user
// (spec §7).
export function useInstitutionClasses() {
  const { institutionId } = useAuth();
  return useQuery({
    queryKey: classesQueryKey(institutionId ?? ''),
    queryFn: () => fetchClasses(institutionId as string),
    // Gated on DATA_MODE (not just USE_MOCK) so Blank mode also fires zero
    // Firestore reads, per the tri-state contract (docs/FEATURE_FLAG_DATA_MODE.md).
    staleTime: REFERENCE_STALE_MS,
    enabled: DATA_MODE === 'live' && !!institutionId && institutionId !== '*',
  });
}

// For imperative (non-render-bound) consumers — click handlers, one-off
// maintenance-tool IIFEs — that can't call the hook directly but should
// still share its cache entry rather than re-reading independently.
export function fetchInstitutionClasses(institutionId: string): Promise<InstitutionClass[]> {
  return queryClient.fetchQuery({
    queryKey: classesQueryKey(institutionId),
    queryFn: () => fetchClasses(institutionId),
    staleTime: REFERENCE_STALE_MS,
  });
}
