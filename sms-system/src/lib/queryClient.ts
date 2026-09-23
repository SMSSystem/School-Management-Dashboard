import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // "Realtime not essential" (confirmed decision) — a short staleness
      // window is acceptable for the vast majority of converted pages.
      // Per-query overrides are expected for anything needing to feel
      // fresher (e.g. right after a create/update — see the spec's §5
      // invalidation convention, which handles that case explicitly rather
      // than via a shorter global default).
      staleTime: 60_000,
      // Firestore's own SDK already manages connection/reactivity concerns
      // differently than a typical REST API; refetching every window focus
      // would undercut the whole point of this caching layer.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

// Cross-reload cache persistence — sessionStorage (not localStorage):
// survives reloads within a tab, clears automatically on tab/browser close as
// a safety net even if the explicit sign-out clear (AuthContext.signOut()) is
// somehow missed, and matches this app's existing sessionStorage-based
// filter-persistence convention (filterPersistence.ts's `sms_filter_` prefix).
const persister = createSyncStoragePersister({
  storage: window.sessionStorage,
  key: 'sms_query_cache',
});

persistQueryClient({
  queryClient,
  persister,
  // A restored-from-storage cache older than this is discarded outright
  // rather than served stale-then-revalidated — matches Firestore's own
  // 30-minute resume-token delta-billing window, so a reload within that
  // window benefits from both mechanisms together, and a reload after it
  // behaves as a clean cold start either way.
  maxAge: 30 * 60 * 1000,
});
