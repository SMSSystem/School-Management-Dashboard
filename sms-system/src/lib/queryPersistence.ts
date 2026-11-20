// Which React Query results may be written to sessionStorage, and when.
//
// The query cache is persisted so a reload (or a navigation that remounts the
// app) does not re-read reference data from Firestore, which matters now that
// the SDK cache is memory-only (lib/firebase.ts). It used to persist EVERYTHING
// except queries that opted out, which put the whole user directory — DOBs, ID
// numbers, phones, addresses — in `sms_query_cache`, readable from DevTools and
// carried over to whoever signs in next in the same tab.
//
// Now:
//   - ALLOW-LIST: only the reference-data roots below are written. A new query
//     is private by default; add its root here only if it holds no personal data.
//   - OWNER: the persisted blob is stamped with the signed-in uid (`buster`); a
//     blob written by anyone else is discarded, not restored.
//   - TIMING: persistence starts only once the uid is known (after auth is
//     ready), and stops the moment the user is lost.

import { persistQueryClientRestore, persistQueryClientSubscribe } from '@tanstack/react-query-persist-client';
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister';
import type { Query } from '@tanstack/react-query';
import { reviveFirestoreTimestamps } from './firestoreJson';
import { queryClient } from './queryClient';

export const QUERY_CACHE_STORAGE_KEY = 'sms_query_cache';

// A restored cache older than this is discarded outright — matches the old
// Firestore resume-token window, so a reload within it is cheap and a reload
// after it is a clean cold start.
// fallow-ignore-next-line unused-export -- queryPolicies.test.ts imports this, and Fallow ignores that test
export const QUERY_CACHE_MAX_AGE_MS = 30 * 60 * 1000;

// Root segment of the query key (queryKey[0]). Reference data only — NO personal
// data. Deliberately absent: users, classStudents, linkedChildren, houses
// (carries student ids), profile*, auditLog, lessonNotes, anything per-person.
export const PERSISTABLE_QUERY_ROOTS: readonly string[] = [
  'terms',
  'academicYears',
  'academicYear',
  'nonSchoolDays',
  'classes',
  'class',
  'subjects',
  'departments',
  'nextClassSlots',
  'dashboardCounts', // head-counts only (lib/dashboardCounts.ts)
  'classPopulation', // per-class head-count (lib/classPopulation.ts)
];

export function isPersistableQueryKey(queryKey: readonly unknown[]): boolean {
  const root = queryKey[0];
  return typeof root === 'string' && PERSISTABLE_QUERY_ROOTS.includes(root);
}

// Firestore Timestamps don't survive the JSON round trip; the reviver rebuilds them (lib/firestoreJson.ts).
// See USE_INSTITUTION_ACADEMIC_CALENDAR_CACHING_REMEDIATION_PLAN.md for the history.
function createPersister() {
  return createSyncStoragePersister({
    storage: window.sessionStorage,
    key: QUERY_CACHE_STORAGE_KEY,
    deserialize: (cachedString) => JSON.parse(cachedString, reviveFirestoreTimestamps),
  });
}

let unsubscribe: (() => void) | null = null;
let activeUid: string | null = null;

/** Restores this user's cache (if any) and starts persisting. Idempotent per uid. */
export function startQueryPersistence(uid: string): void {
  if (typeof window === 'undefined') return;
  if (activeUid === uid && unsubscribe) return;
  stopQueryPersistence();
  activeUid = uid;

  let persister: ReturnType<typeof createPersister>;
  try {
    persister = createPersister();
  } catch {
    return; // sessionStorage unavailable: run without persistence
  }
  const options = {
    queryClient,
    persister,
    maxAge: QUERY_CACHE_MAX_AGE_MS,
    buster: uid,
    dehydrateOptions: {
      // Allow-list AND the cursor-page opt-out (hooks/useCursorPages.ts holds
      // snapshots as cursors, which don't survive JSON).
      shouldDehydrateQuery: (query: Query) =>
        query.state.status === 'success' &&
        query.meta?.persist !== false &&
        isPersistableQueryKey(query.queryKey),
    },
  };
  // Restore first, subscribe after: TanStack's own persistQueryClient does the
  // same, so a save can never overwrite the stored blob with a cache that has
  // not been rehydrated yet. A stop (sign-out) or a different uid arriving
  // while the restore is in flight cancels the subscribe.
  void persistQueryClientRestore(options)
    .catch(() => undefined)
    .then(() => {
      if (activeUid === uid && !unsubscribe) {
        unsubscribe = persistQueryClientSubscribe(options);
      }
    });
}

export function stopQueryPersistence(): void {
  activeUid = null;
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
}
