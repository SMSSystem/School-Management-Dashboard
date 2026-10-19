import { useQuery } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { fetchTerms, termsQueryKey, type InstitutionTerm } from '@/lib/termsQuery';
import { useTermOrder } from '@/hooks/useTermOrder';
import { REFERENCE_STALE_MS } from '@/lib/queryPolicies';

export type { InstitutionTerm };
export { termsQueryKey };

// Phase 3a reference-data hook (docs/miscellaneous-specs/FIRESTORE_READ_CACHING_SPEC.md
// §5.1): collapses every unfiltered per-file terms dropdown/reference read
// into one shared, cached query. No role branching needed — the `terms` read
// rule is role-agnostic for any same-institution signed-in user (spec §7).
export function useInstitutionTerms() {
  const { institutionId } = useAuth();
  // The terms come out in this calendar's order (lib/termOrder.ts): by start date for a standard calendar, the
  // calendar's concurrent-block order for a custom one. Applied here, once, so every term dropdown follows.
  // The cache holds the terms as read; `select` orders what each consumer receives.
  const sortTerms = useTermOrder();
  return useQuery({
    queryKey: termsQueryKey(institutionId ?? ''),
    queryFn: () => fetchTerms(institutionId as string),
    select: sortTerms,
    // Gated on DATA_MODE (not just USE_MOCK) so Blank mode also fires zero
    // Firestore reads, per the tri-state contract
    // (docs/FEATURE_FLAG_DATA_MODE.md) — most existing per-file call sites
    // this hook replaces only checked USE_MOCK and fired a live read in
    // Blank mode anyway (a pre-existing gap); this hook doesn't repeat it.
    staleTime: REFERENCE_STALE_MS,
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
    staleTime: REFERENCE_STALE_MS,
  });
}
