import { useQuery } from '@tanstack/react-query';
import { institutionCollection } from '@/lib/paths';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import type { ClassDocument } from '@/lib/firebase';
import { REFERENCE_STALE_MS } from '@/lib/queryPolicies';
import { docsThrough } from '@/lib/offline/workingCopyReads';

export type InstitutionClass = ClassDocument & { id: string };

function classesQueryKey(institutionId: string) {
  return ['classes', institutionId] as const;
}

// With a working copy for staff, so the register pages still have their class list offline.
function fetchClasses(institutionId: string): Promise<InstitutionClass[]> {
  return docsThrough<InstitutionClass>(`classes:${institutionId}`, institutionCollection(institutionId, 'classes'));
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
