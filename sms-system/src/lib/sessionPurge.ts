// Everything the browser keeps about a signed-in person, and the one place that
// gets rid of it.
//
// What lives where (all of it must be gone once the person signs out):
//   - the Firestore SDK's in-memory cache and the React Query cache (module
//     state, so only a page load truly empties them);
//   - sessionStorage: `sms_query_cache` (persisted query results), `sms_filter_*`
//     (page filters, current term), the sign-in log flag, the institution picked
//     on the login form (`sms_pending_login_institution`);
//   - localStorage: unsent attendance drafts not yet moved to the encrypted store (attendanceDraft.ts) and a student's
//     exam answers (examAnswerDraft.ts);
//   - IndexedDB: copies of lesson-note files and the record of what was downloaded (noteFileStore.ts), and the
//     encrypted working copies kept for offline use (offline/offlineStore.ts);
//   - sessionStorage: the key for those working copies (offline/sessionKeyStorage.ts).
//
// AuthContext calls purgeSession() whenever an authenticated user is lost — the
// sign-out button, the inactivity timer, a displaced session, a deactivated
// account, an expired or revoked token — and then reloads to /login. The reload is
// deliberate: the SDK cache cannot be emptied while the app runs, and a reload is
// the only way to guarantee the next person on this browser starts cold.

import { clearAllDrafts } from "./attendanceDraft";
import { clearAllExamDrafts } from "./examAnswerDraft";
import { clearAllPersistedFilters } from "./filterPersistence";
import { purgeNoteFileStore } from "./noteFileStore";
import { purgeOfflineStore } from "./offline/offlineStore";
import { forgetSessionKey } from "./offline/sessionKeyStorage";
import { clearPendingLoginInstitution } from "./pendingLoginInstitution";
import { queryClient } from "./queryClient";
import {
  QUERY_CACHE_STORAGE_KEY,
  stopQueryPersistence,
} from "./queryPersistence";

const NOTICE_KEY = "sms_account_notice";
export const SESSION_SIGNIN_KEY = "sms_signin_logged";

/** Carries a sign-out reason across the reload so the login page can show it. */
export function stashAccountNotice(message: string): void {
  try {
    sessionStorage.setItem(NOTICE_KEY, message);
  } catch {
    /* the notice is a courtesy */
  }
}

// Read-and-remove happens once per page load; later calls return the same value.
// A React state initializer can run twice in StrictMode (dev), and a second
// read-and-remove would otherwise return null and drop the reason.
let takenNotice: string | null | undefined;

/** Returns the reason stashed before the last sign-out reload, once per page load. */
export function takeAccountNotice(): string | null {
  if (takenNotice !== undefined) return takenNotice;
  try {
    const v = sessionStorage.getItem(NOTICE_KEY);
    if (v !== null) sessionStorage.removeItem(NOTICE_KEY);
    takenNotice = v;
  } catch {
    takenNotice = null;
  }
  return takenNotice;
}

/** Test seam: forget the per-page-load memo. */
export function resetTakenAccountNoticeForTests(): void {
  takenNotice = undefined;
}

// A sign-out the person did not ask for (their session was taken over by another device) keeps the exam backup of that
// account: it holds the answers not yet saved to the server, and the same account's next sign-in resumes from it. It is
// answers only, keyed to the account, removed by the next sign-in of any other account (examAnswerDraft.ts) and by its
// own 24-hour limit. Every other way out, including the Sign out button, still removes it.
let keepExamAnswers = false;

/** Call just before a forced sign-out so the purge that follows leaves the exam backup. */
export function keepExamAnswersOnNextPurge(): void {
  keepExamAnswers = true;
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
  if (!keepExamAnswers) clearAllExamDrafts();
  keepExamAnswers = false;
  clearPendingLoginInstitution();
  purgeNoteFileStore();
  purgeOfflineStore();
  forgetSessionKey();
  try {
    sessionStorage.removeItem(QUERY_CACHE_STORAGE_KEY);
    sessionStorage.removeItem(SESSION_SIGNIN_KEY);
  } catch {
    /* non-fatal */
  }
}

/** Leaves the app with a cold start: the SDK's memory cache goes with the page. */
export function reloadToLogin(): void {
  if (typeof window === "undefined") return;
  window.location.replace("/login");
}
