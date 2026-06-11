import type { AttendanceSession } from './attendanceWindows';

export interface DraftRecord {
  state: 'P' | 'A' | 'L' | 'S' | 'E';
  reason?: string; // E state only; max 50 chars
}

type DraftMap = Record<string, DraftRecord>; // keyed by studentId

const PREFIX = 'attendance_draft_';

function key(institutionId: string, classId: string, date: string, session: AttendanceSession) {
  return `${PREFIX}${institutionId}_${classId}_${date}_${session}`;
}

export function getDraft(
  institutionId: string, classId: string, date: string, session: AttendanceSession,
): DraftMap {
  try {
    const raw = localStorage.getItem(key(institutionId, classId, date, session));
    return raw ? (JSON.parse(raw) as DraftMap) : {};
  } catch { return {}; }
}

export function setDraftCell(
  institutionId: string, classId: string, date: string,
  session: AttendanceSession, studentId: string, record: DraftRecord,
): void {
  const k = key(institutionId, classId, date, session);
  const current = getDraft(institutionId, classId, date, session);
  localStorage.setItem(k, JSON.stringify({ ...current, [studentId]: record }));
}

export function clearDraft(
  institutionId: string, classId: string, date: string, session: AttendanceSession,
): void {
  localStorage.removeItem(key(institutionId, classId, date, session));
}

/**
 * Removes stale drafts whose dates predate the current term start.
 * Call on dashboard or register page mount.
 */
export function purgeExpiredDrafts(termStartDate: string): void {
  const toRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k?.startsWith(PREFIX)) continue;
    // Key: attendance_draft_{instId}_{classId}_{YYYY-MM-DD}_{session}
    const parts = k.split('_');
    const datePart = parts[parts.length - 2]; // second-to-last segment
    if (datePart < termStartDate) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));
}
