/**
 * Per-page filter persistence (class/subject selections on Gradebook, General
 * Attendance, and Subject Attendance) via sessionStorage — survives navigation
 * within a tab/session, cleared on logout via clearAllPersistedFilters().
 *
 * Term selection (DEV_NOTES Item 6.2) is a single app-wide value, not a
 * per-page filter — getPersistedFilter/setPersistedFilter deliberately don't
 * cover it. It's still stored here (see getPersistedCurrentTerm/
 * setPersistedCurrentTerm below) so it shares this module's sessionStorage
 * prefix and clear-on-logout sweep, just through its own dedicated functions
 * rather than being forced through the per-page filter API.
 */

import { removeStorageKeysByPrefix } from './storagePrefixScan';

const PREFIX = 'sms_filter_';

function storageKey(page: string, key: string): string {
  return `${PREFIX}${page}_${key}`;
}

function readStorageKey(key: string): string {
  try {
    return sessionStorage.getItem(key) ?? '';
  } catch {
    return '';
  }
}

function writeStorageKey(key: string, value: string): void {
  try {
    if (value) {
      sessionStorage.setItem(key, value);
    } else {
      sessionStorage.removeItem(key);
    }
  } catch {
    // sessionStorage unavailable (e.g. private browsing edge cases) — persistence
    // is a convenience, not a requirement, so fail silently.
  }
}

export function getPersistedFilter(page: string, key: string): string {
  return readStorageKey(storageKey(page, key));
}

export function setPersistedFilter(page: string, key: string, value: string): void {
  writeStorageKey(storageKey(page, key), value);
}

// App-wide "current term" (DEV_NOTES Item 6.2) — NOT a per-page filter (see
// the module comment above), but stored under the same sms_filter_ prefix so
// it's still covered by clearAllPersistedFilters()'s clear-on-logout sweep.
// Dedicated functions rather than CurrentTermContext.tsx calling
// getPersistedFilter/setPersistedFilter with a synthetic 'app' page, so the
// per-page filter API isn't stretched to cover a value it explicitly excludes.
const CURRENT_TERM_KEY = storageKey('app', 'currentTermId');

export function getPersistedCurrentTerm(): string {
  return readStorageKey(CURRENT_TERM_KEY);
}

export function setPersistedCurrentTerm(value: string): void {
  writeStorageKey(CURRENT_TERM_KEY, value);
}

export function clearAllPersistedFilters(): void {
  try {
    removeStorageKeysByPrefix(sessionStorage, PREFIX);
  } catch {
    // See setPersistedFilter — non-fatal.
  }
}
