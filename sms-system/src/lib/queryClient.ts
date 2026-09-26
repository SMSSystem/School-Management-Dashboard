import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import { Timestamp } from 'firebase/firestore';

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
// Firestore Timestamp instances don't survive a JSON round-trip by default:
// Timestamp.prototype.toJSON() (which JSON.stringify calls automatically,
// before any replacer even runs) produces a plain
// {type: 'firestore/timestamp/1.0', seconds, nanoseconds} object — so any
// cached query result containing a Timestamp field loses its .toMillis()/
// .toDate() methods the moment it's restored from sessionStorage on a fresh
// page load. Confirmed empirically (not assumed) while converting
// useInstitutionAcademicCalendar() to react-query — see
// internal/custom-calendar-related/USE_INSTITUTION_ACADEMIC_CALENDAR_CACHING_REMEDIATION_PLAN.md:
// activeTimeBlocks' sort comparator calls createdAt.toMillis(), which threw
// "not a function" on any cached-and-restored AcademicYearDocument. A latent
// gap in this file's own persistence layer since Phase 1b shipped, not
// specific to that one hook — anything caching a Timestamp-bearing document
// was always one reload-within-60s away from the same crash; this hook's
// sort comparator was just the first thing to actually call a Timestamp
// method on cached data.
//
// Fix: a custom deserialize reviver that recognizes Timestamp's own toJSON()
// shape (no custom serialize/replacer needed — the default JSON.stringify
// already produces that shape correctly on the way out) and reconstructs a
// real Timestamp instance wherever it finds one, at any nesting depth within
// the persisted cache (JSON.parse's reviver runs bottom-up on every key).
function reviveFirestoreTimestamps(_key: string, value: unknown): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    (value as { type?: unknown }).type === 'firestore/timestamp/1.0'
  ) {
    const { seconds, nanoseconds } = value as { seconds: number; nanoseconds: number };
    return new Timestamp(seconds, nanoseconds);
  }
  return value;
}

const persister = createSyncStoragePersister({
  storage: window.sessionStorage,
  key: 'sms_query_cache',
  deserialize: (cachedString) => JSON.parse(cachedString, reviveFirestoreTimestamps),
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
