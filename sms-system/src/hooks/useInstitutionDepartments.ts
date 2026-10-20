import { useQuery } from '@tanstack/react-query';
import { getDocs } from 'firebase/firestore';
import { institutionCollection } from '@/lib/paths';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import type { DepartmentDocument } from '@/lib/firebase';
import { REFERENCE_STALE_MS } from '@/lib/queryPolicies';

export type InstitutionDepartment = DepartmentDocument & { id: string };

function departmentsQueryKey(institutionId: string) {
  return ['departments', institutionId] as const;
}

async function fetchDepartments(institutionId: string): Promise<InstitutionDepartment[]> {
  const snap = await getDocs(institutionCollection(institutionId, 'departments'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as DepartmentDocument) }));
}

// Phase 3a reference-data hook (docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md §5.1).
export function useInstitutionDepartments() {
  const { institutionId } = useAuth();
  return useQuery({
    queryKey: departmentsQueryKey(institutionId ?? ''),
    queryFn: () => fetchDepartments(institutionId as string),
    // Gated on DATA_MODE (not just USE_MOCK) so Blank mode also fires zero
    // Firestore reads, per the tri-state contract (docs/FEATURE_FLAG_DATA_MODE.md).
    staleTime: REFERENCE_STALE_MS,
    enabled: DATA_MODE === 'live' && !!institutionId && institutionId !== '*',
  });
}

// For imperative (non-render-bound) consumers — click handlers, one-off
// maintenance-tool IIFEs — that can't call the hook directly but should
// still share its cache entry rather than re-reading independently.
export function fetchInstitutionDepartments(institutionId: string): Promise<InstitutionDepartment[]> {
  return queryClient.fetchQuery({
    queryKey: departmentsQueryKey(institutionId),
    queryFn: () => fetchDepartments(institutionId),
    staleTime: REFERENCE_STALE_MS,
  });
}
