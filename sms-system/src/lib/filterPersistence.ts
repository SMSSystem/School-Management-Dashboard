/**
 * Per-page filter persistence (class/subject selections on Gradebook, General
 * Attendance, and Subject Attendance) via sessionStorage — survives navigation
 * within a tab/session, cleared on logout via clearAllPersistedFilters().
 *
 * Term selection is deliberately NOT covered here — it's slated to become a
 * single app-wide value (see DEV_NOTES_IMPLEMENTATION_PLAN.md Item 6.2)
 * rather than a per-page persisted filter.
 */

const PREFIX = 'sms_filter_';

function storageKey(page: string, key: string): string {
  return `${PREFIX}${page}_${key}`;
}

export function getPersistedFilter(page: string, key: string): string {
  try {
    return sessionStorage.getItem(storageKey(page, key)) ?? '';
  } catch {
    return '';
  }
}

export function setPersistedFilter(page: string, key: string, value: string): void {
  try {
    if (value) {
      sessionStorage.setItem(storageKey(page, key), value);
    } else {
      sessionStorage.removeItem(storageKey(page, key));
    }
  } catch {
    // sessionStorage unavailable (e.g. private browsing edge cases) — persistence
    // is a convenience, not a requirement, so fail silently.
  }
}

export function clearAllPersistedFilters(): void {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const key = sessionStorage.key(i);
      if (key?.startsWith(PREFIX)) sessionStorage.removeItem(key);
    }
  } catch {
    // See setPersistedFilter — non-fatal.
  }
}
