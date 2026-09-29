// Pure, Firestore-free retention math for assignment submissions — split
// out of submissions.ts (which otherwise pulls in ./firebase's app/App
// Check/persistent-cache initialization, unsafe to import in a Node test
// environment: `self` isn't defined there) so this can be unit-tested in
// isolation, mirroring gradeEntryTracking.ts/reportBuilder.ts/
// reportCardUtils.ts's own "pure and Firestore-free... unit-tested in
// isolation" convention. `Timestamp` here is the plain data class from the
// 'firebase/firestore' package itself, not this project's own ./firebase
// wrapper — importing it has no side effects.
//
// Both functions must compute byte-identical results to firestore.rules'
// expectedDeleteAt()/expectedSubmissionStatus() (fixed 182-day duration, no
// calendar-month arithmetic) — see ASSIGNMENTS_FEATURE_SPEC.md §9.1. A
// mismatch would reject every real student submission at write time, since
// the rule re-derives deleteAt/status from submittedAt and checks them
// against what the client sent via exact equality.

import { Timestamp } from 'firebase/firestore';

const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;

export function computeDeleteAt(dueDateTimestamp: Timestamp, submittedAt: Timestamp): Timestamp {
  const fromDueDate = dueDateTimestamp.toMillis() + SIX_MONTHS_MS;
  const fromSubmission = submittedAt.toMillis() + SIX_MONTHS_MS;
  return Timestamp.fromMillis(Math.max(fromDueDate, fromSubmission));
}

export function computeStatus(dueDateTimestamp: Timestamp, submittedAt: Timestamp): 'submitted' | 'late' {
  return submittedAt.toMillis() > dueDateTimestamp.toMillis() ? 'late' : 'submitted';
}
