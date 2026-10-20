// How long cached data may be reused before the app asks Firestore again, in one place. Every query and every
// imperative fetchQuery takes its staleTime from here (queryPolicies.test.ts fails on a number written anywhere
// else), so reading less or less often is one decision, not a search through the hooks.
//
// A person's own saves never wait for these: the mutation paths invalidate the affected query roots at once. These
// values only decide how long another person's change can stay out of sight.

/** Slowly-changing reference data: terms, academic years, non-school days, classes, subjects, departments, houses,
 *  class head counts, the platform's institutions list. */
export const REFERENCE_STALE_MS = 10 * 60_000;

/** Lists of people and what hangs off them (users, a class's students, linked children, photos, tracking). Kept in
 *  memory only: personal data is never persisted (queryPersistence.ts). */
export const LIST_STALE_MS = 5 * 60_000;

/** The default for anything that is being worked on live (attendance, results being entered). */
export const LIVE_STALE_MS = 60_000;

/** Head counts shown on dashboards. */
export const COUNT_STALE_MS = 5 * 60_000;

/** How long a live list's listener stays open after the last page using it is left (sharedListener.ts). A revisit in
 *  this window reads nothing; the listener keeps receiving changes meanwhile, so the list is current when it returns. */
export const LISTENER_KEEP_OPEN_MS = 5 * 60_000;
