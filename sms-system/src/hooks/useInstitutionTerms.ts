import { useQuery } from '@tanstack/react-query';
import { getDocs } from 'firebase/firestore';
import { institutionCollection } from '@/lib/paths';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import type { TermDocument } from '@/lib/firebase';

export type InstitutionTerm = TermDocument & { id: string };

function termsQueryKey(institutionId: string) {
  return ['terms', institutionId] as const;
}

async function fetchTerms(institutionId: string): Promise<InstitutionTerm[]> {
  const snap = await getDocs(institutionCollection(institutionId, 'terms'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TermDocument) }));
}

// Phase 3a reference-data hook (docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md
// §5.1): collapses every unfiltered per-file terms dropdown/reference read
// into one shared, cached query. No role branching needed — the `terms` read
// rule is role-agnostic for any same-institution signed-in user (spec §7).
export function useInstitutionTerms() {
  const { institutionId } = useAuth();
  return useQuery({
    queryKey: termsQueryKey(institutionId ?? ''),
    queryFn: () => fetchTerms(institutionId as string),
    // Gated on DATA_MODE (not just USE_MOCK) so Blank mode also fires zero
    // Firestore reads, per the tri-state contract
    // (docs/FEATURE_FLAG_DATA_MODE.md) — most existing per-file call sites
    // this hook replaces only checked USE_MOCK and fired a live read in
    // Blank mode anyway (a pre-existing gap); this hook doesn't repeat it.
    enabled: DATA_MODE === 'live' && !!institutionId && institutionId !== '*',
  });
}

// For imperative (non-render-bound) consumers — click handlers, one-off
// maintenance-tool IIFEs — that can't call the hook directly but should
// still share its cache entry rather than re-reading independently.
export function fetchInstitutionTerms(institutionId: string): Promise<InstitutionTerm[]> {
  return queryClient.fetchQuery({
    queryKey: termsQueryKey(institutionId),
    queryFn: () => fetchTerms(institutionId),
  });
}
