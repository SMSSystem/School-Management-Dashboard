import type { AttendanceSession } from './attendanceWindows';
import type { AttendanceState } from './attendanceStates';
import { removeStorageKeysByPrefix } from './storagePrefixScan';

export interface DraftRecord {
  state: AttendanceState;
  reason?: string; // E state only; max 60 chars (see ExcusedReasonPopover.tsx's REASON_MAX_LENGTH)
}

type DraftMap = Record<string, DraftRecord>; // keyed by studentId

// A draft is unsent register data, and its excused reasons are free text (they can
// be medical). It lives in localStorage so a reload doesn't lose a half-entered
// register, which means it also outlives the tab — so:
//   - the key carries the signed-in uid, and only that user's drafts are read;
//   - the value carries `savedAt` (24 h TTL) and the register `date` (term purge);
//   - every sign-out path and a change of user wipes them (sessionPurge.ts), and
//     any draft belonging to another uid is removed at sign-in.
// Old-format keys (`attendance_draft_...`, no uid, no envelope) are removed at
// sign-in and never read.
const PREFIX = 'attendance_draft:';
const LEGACY_PREFIX = 'attendance_draft_';
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

interface DraftEnvelope {
  savedAt: number;
  date: string; // YYYY-MM-DD of the register the draft belongs to
  cells: DraftMap;
}

// Set by AuthContext as the auth state changes. With no owner there is nothing
// to read or write, so a draft can never be stored under, or read by, nobody.
let owner: string | null = null;

export function setDraftOwner(uid: string | null): void {
  owner = uid;
}

function ownerPrefix(uid: string): string {
  return `${PREFIX}${uid}:`;
}

function generalKey(
  uid: string, institutionId: string, classId: string, date: string, session: AttendanceSession,
): string {
  return `${ownerPrefix(uid)}general:${institutionId}_${classId}_${date}_${session}`;
}

function subjectKey(
  uid: string, institutionId: string, subjectId: string, classId: string, date: string,
): string {
  return `${ownerPrefix(uid)}subject:${institutionId}_${subjectId}_${classId}_${date}`;
}

function readEnvelope(key: string, now: number): DraftEnvelope | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DraftEnvelope> | null;
    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      typeof parsed.cells !== 'object' || parsed.cells === null
    ) {
      localStorage.removeItem(key);
      return null;
    }
    if (now - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed as DraftEnvelope;
  } catch {
    return null;
  }
}

function readCells(key: string): DraftMap {
  return readEnvelope(key, Date.now())?.cells ?? {};
}

function writeCell(key: string, date: string, studentId: string, record: DraftRecord): void {
  const current = readCells(key);
  const envelope: DraftEnvelope = {
    savedAt: Date.now(),
    date,
    cells: { ...current, [studentId]: record },
  };
  try {
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota or storage unavailable: a draft is a convenience, never fatal.
  }
}

export function getDraft(
  institutionId: string, classId: string, date: string, session: AttendanceSession,
): DraftMap {
  if (!owner) return {};
  return readCells(generalKey(owner, institutionId, classId, date, session));
}

export function setDraftCell(
  institutionId: string, classId: string, date: string,
  session: AttendanceSession, studentId: string, record: DraftRecord,
): void {
  if (!owner) return;
  writeCell(generalKey(owner, institutionId, classId, date, session), date, studentId, record);
}

export function clearDraft(
  institutionId: string, classId: string, date: string, session: AttendanceSession,
): void {
  if (!owner) return;
  try {
    localStorage.removeItem(generalKey(owner, institutionId, classId, date, session));
  } catch { /* non-fatal */ }
}

// Subject attendance registers (one draft per subject + class + date).
export function getSubjectDraft(
  institutionId: string, subjectId: string, classId: string, date: string,
): DraftMap {
  if (!owner) return {};
  return readCells(subjectKey(owner, institutionId, subjectId, classId, date));
}

export function setSubjectDraftCell(
  institutionId: string, subjectId: string, classId: string, date: string,
  studentId: string, record: DraftRecord,
): void {
  if (!owner) return;
  writeCell(subjectKey(owner, institutionId, subjectId, classId, date), date, studentId, record);
}

export function clearSubjectDraft(
  institutionId: string, subjectId: string, classId: string, date: string,
): void {
  if (!owner) return;
  try {
    localStorage.removeItem(subjectKey(owner, institutionId, subjectId, classId, date));
  } catch { /* non-fatal */ }
}

/**
 * Removes this user's drafts for registers dated before the current term start,
 * and any that have outlived the TTL. Call on dashboard or register page mount.
 */
export function purgeExpiredDrafts(termStartDate: string): void {
  if (!owner) return;
  const now = Date.now();
  try {
    removeStorageKeysByPrefix(localStorage, ownerPrefix(owner), (k) => {
      const envelope = readEnvelope(k, now); // also drops malformed / expired ones
      return envelope === null ? false : envelope.date < termStartDate;
    });
  } catch { /* non-fatal */ }
}

/** Wipes every attendance draft in this browser (all users, old and new format). */
export function clearAllDrafts(): void {
  try {
    removeStorageKeysByPrefix(localStorage, PREFIX);
    removeStorageKeysByPrefix(localStorage, LEGACY_PREFIX);
  } catch { /* non-fatal */ }
}

/** At sign-in: drop drafts left behind by anyone else, and old-format ones. */
export function dropForeignDrafts(uid: string): void {
  try {
    const mine = ownerPrefix(uid);
    removeStorageKeysByPrefix(localStorage, PREFIX, (k) => !k.startsWith(mine));
    removeStorageKeysByPrefix(localStorage, LEGACY_PREFIX);
  } catch { /* non-fatal */ }
}
