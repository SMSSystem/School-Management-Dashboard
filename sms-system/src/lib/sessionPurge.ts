// Everything the browser keeps about a signed-in person, and the one place that
// gets rid of it.
//
// What lives where (all of it must be gone once the person signs out):
//   - the Firestore SDK's in-memory cache and the React Query cache (module
//     state, so only a page load truly empties them);
//   - sessionStorage: `sms_query_cache` (persisted query results), `sms_filter_*`
//     (page filters, current term), the sign-in log flag;
//   - localStorage: unsent attendance drafts (attendanceDraft.ts).
//
// AuthContext calls purgeSession() whenever an authenticated user is lost — the
// sign-out button, the inactivity timer, a displaced session, a deactivated
// account, an expired or revoked token — and then reloads to /login. The reload is
// deliberate: the SDK cache cannot be emptied while the app runs, and a reload is
// the only way to guarantee the next person on this browser starts cold.

import { clearAllDrafts } from './attendanceDraft';
import { clearAllPersistedFilters } from './filterPersistence';
import { queryClient } from './queryClient';
import { QUERY_CACHE_STORAGE_KEY, stopQueryPersistence } from './queryPersistence';

const NOTICE_KEY = 'sms_account_notice';
export const SESSION_SIGNIN_KEY = 'sms_signin_logged';

/** Carries a sign-out reason across the reload so the login page can show it. */
export function stashAccountNotice(message: string): void {
  try {
    sessionStorage.setItem(NOTICE_KEY, message);
  } catch {
    /* the notice is a courtesy */
  }
}

/** Read once at start-up: returns the stashed reason and forgets it. */
export function takeAccountNotice(): string | null {
  try {
    const v = sessionStorage.getItem(NOTICE_KEY);
    if (v !== null) sessionStorage.removeItem(NOTICE_KEY);
    return v;
  } catch {
    return null;
  }
}

/** Clears every browser-side copy of the signed-in person's data. Never throws. */
export function purgeSession(): void {
  stopQueryPersistence();
  try {
    void queryClient.cancelQueries();
    queryClient.clear();
  } catch {
    /* keep purging */
  }
  clearAllPersistedFilters();
  clearAllDrafts();
  try {
    sessionStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_SIGNIN_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Leaves the app with a cold start: the SDK's memory cache goes with the page. */
export function reloadToLogin(): void {
  if (typeof window === 'undefined') return;
  window.location.replace('/login');
}
