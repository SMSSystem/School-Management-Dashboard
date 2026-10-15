import { queryClient } from './queryClient';
import type { Assignment, FeedbackLite, ResultLite } from './gradeEntryTracking';

// The cache side of Grade-Entry Tracking (the loader that reads Firestore is gradeTrackingLoader.ts).
// Kept free of Firebase imports so it can be unit tested and used without loading the SDK.
//
// A term's results and feedback are thousands of documents, so the page loads them only on request
// and keeps them for TRACKING_STALE_MS. The cache root is deliberately NOT in PERSISTABLE_QUERY_ROOTS
// (lib/queryPersistence.ts): the data holds student ids, so it is never written to sessionStorage,
// and sign-out clears it (lib/sessionPurge.ts).

export const TRACKING_STALE_MS = 5 * 60 * 1000;
export const TRACKING_QUERY_ROOT = 'gradeEntryTracking';

export type TrackingData = {
  assignments: Assignment[];
  results: ResultLite[];
  feedback: FeedbackLite[];
  /** classId -> number of students (classes with none are left out). */
  rosters: Map<string, number>;
  /** Firestore reads this load cost: documents fetched plus one per count query. */
  docsRead: number;
};

export const trackingQueryKey = (institutionId: string, termId: string) =>
  [TRACKING_QUERY_ROOT, institutionId, termId] as const;

/** classId -> student count, leaving out empty classes (the shape computeTracking expects). */
export function rosterFromCounts(counts: { classId: string; count: number }[]): Map<string, number> {
  const roster = new Map<string, number>();
  for (const { classId, count } of counts) if (count > 0) roster.set(classId, count);
  return roster;
}

/** The cached data if it is still fresh, otherwise undefined. Never reads Firestore. */
export function cachedTrackingData(institutionId: string, termId: string): TrackingData | undefined {
  const state = queryClient.getQueryState<TrackingData>(trackingQueryKey(institutionId, termId));
  if (!state?.data || Date.now() - state.dataUpdatedAt > TRACKING_STALE_MS) return undefined;
  return state.data;
}
