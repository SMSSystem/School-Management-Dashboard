import { useQuery } from '@tanstack/react-query';
import { getDocs } from 'firebase/firestore';
import { institutionCollection } from '@/lib/paths';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import type { HouseDocument } from '@/lib/firebase';

export type InstitutionHouse = HouseDocument & { id: string };

function housesQueryKey(institutionId: string) {
  return ['houses', institutionId] as const;
}

async function fetchHouses(institutionId: string): Promise<InstitutionHouse[]> {
  const snap = await getDocs(institutionCollection(institutionId, 'houses'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as HouseDocument) }));
}

// Phase 3a reference-data hook (docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md §5.1).
export function useInstitutionHouses() {
  const { institutionId } = useAuth();
  return useQuery({
    queryKey: housesQueryKey(institutionId ?? ''),
    queryFn: () => fetchHouses(institutionId as string),
    // Gated on DATA_MODE (not just USE_MOCK) so Blank mode also fires zero
    // Firestore reads, per the tri-state contract (docs/FEATURE_FLAG_DATA_MODE.md).
    enabled: DATA_MODE === 'live' && !!institutionId && institutionId !== '*',
  });
}

// For imperative (non-render-bound) consumers — click handlers, one-off
// maintenance-tool IIFEs — that can't call the hook directly but should
// still share its cache entry rather than re-reading independently.
export function fetchInstitutionHouses(institutionId: string): Promise<InstitutionHouse[]> {
  return queryClient.fetchQuery({
    queryKey: housesQueryKey(institutionId),
    queryFn: () => fetchHouses(institutionId),
  });
}
