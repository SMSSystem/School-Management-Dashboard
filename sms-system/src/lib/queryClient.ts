import { QueryCache, QueryClient } from '@tanstack/react-query';
import { reportError, whatForQuery } from './reportError';
import { LIVE_STALE_MS } from './queryPolicies';

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // A query that still fails after its retry is reported here, once, instead of every page
    // having to look at isError (reportError.ts decides what the person sees).
    onError: (error, query) => reportError(error, { what: whatForQuery(query.queryKey) }),
  }),
  defaultOptions: {
    queries: {
      // "Realtime not essential" (confirmed decision) — a short staleness
      // window is acceptable for the vast majority of converted pages.
      // Per-query overrides are expected for anything needing to feel
      // fresher (e.g. right after a create/update — see the spec's §5
      // invalidation convention, which handles that case explicitly rather
      // than via a shorter global default).
      staleTime: LIVE_STALE_MS,
      // Firestore's own SDK already manages connection/reactivity concerns
      // differently than a typical REST API; refetching every window focus
      // would undercut the whole point of this caching layer.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Persistence to sessionStorage (reference data only, per signed-in user) is in
// queryPersistence.ts, started by AuthContext once the uid is known — NOT here at
// module load, which used to restore and re-persist the whole cache for whoever
// opened the tab.
