import type { AttendanceSession } from './attendanceWindows';
import type { AttendanceState } from './attendanceStates';
import { removeStorageKeysByPrefix } from './storagePrefixScan';
import { offlineStoreReady, readCopies, removeCopy, saveCopy } from './offline/offlineStore';

export interface DraftRecord {
  state: AttendanceState;
  reason?: string; // E state only; max 60 chars (see ExcusedReasonPopover.tsx's REASON_MAX_LENGTH)
}

type DraftMap = Record<string, DraftRecord>; // keyed by studentId

// A draft is unsent register data, and its excused reasons are free text (they can
// be medical). It must survive a reload, so it outlives the page:
//   - with this tab's offline key (staff, offline/sessionKey.ts), drafts are kept
//     encrypted in the offline store and read from memory; plaintext drafts are
//     moved there and removed (adoptEncryptedDrafts);
//   - without it (before the key is read, or for anyone else), they're kept in
//     localStorage, as before;
//   - the key carries the signed-in uid, and only that user's drafts are read;
//   - the value carries `savedAt` (24 h TTL) and the register `date` (term purge);
//   - every sign-out path and a change of user wipes them (sessionPurge.ts), and
//     any draft belonging to another uid is removed at sign-in.
// Old-format keys (`attendance_draft_...`, no uid, no envelope) are removed at
// sign-in and never read.
const PREFIX = 'attendance_draft:';
const LEGACY_PREFIX = 'attendance_draft_';
const COPY_PREFIX = 'draft:';
export const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

interface DraftEnvelope {
  savedAt: number;
  date: string; // YYYY-MM-DD of the register the draft belongs to
  cells: DraftMap;
}

// Set by AuthContext as the auth state changes. With no owner there is nothing
// to read or write, so a draft can never be stored under, or read by, nobody.
let owner: string | null = null;
// Encrypted mode: the drafts live here, and every change is written to the offline store.
let encrypted = false;
const cache = new Map<string, DraftEnvelope>();

export function setDraftOwner(uid: string | null): void {
  owner = uid;
  encrypted = false;
  cache.clear();
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

function validEnvelope(value: unknown): value is DraftEnvelope {
  const v = value as Partial<DraftEnvelope> | null;
  return !!v && typeof v.savedAt === 'number' && typeof v.cells === 'object' && v.cells !== null;
}

function readStoredEnvelope(key: string, now: number): DraftEnvelope | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!validEnvelope(parsed) || now - parsed.savedAt > DRAFT_TTL_MS) {
      localStorage.removeItem(key);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function forget(key: string): void {
  cache.delete(key);
  if (encrypted) void removeCopy(COPY_PREFIX + key);
  try {
    localStorage.removeItem(key);
  } catch { /* non-fatal */ }
}

function readEnvelope(key: string, now: number): DraftEnvelope | null {
  if (!encrypted) return readStoredEnvelope(key, now);
  const envelope = cache.get(key);
  if (!envelope) return null;
  if (now - envelope.savedAt > DRAFT_TTL_MS) {
    forget(key);
    return null;
  }
  return envelope;
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
  if (encrypted) {
    cache.set(key, envelope);
    void saveCopy(COPY_PREFIX + key, envelope);
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(envelope));
  } catch {
    // Quota or storage unavailable: a draft is a convenience, never fatal.
  }
}

/**
 * Moves this user's drafts into the encrypted offline store, once this tab has its key. Drafts already in the store
 * are loaded into memory; plaintext ones in localStorage are moved there and removed (the newer copy wins). From then
 * on drafts are read from memory and written to the store. Does nothing without an owner or a key. Never throws.
 */
export async function adoptEncryptedDrafts(): Promise<void> {
  const uid = owner;
  if (!uid || encrypted || !offlineStoreReady()) return;
  const stored = await readCopies<DraftEnvelope>(COPY_PREFIX + ownerPrefix(uid));
  if (owner !== uid || encrypted) return; // the user changed, or another call won, while reading
  const now = Date.now();
  for (const { name, value } of stored) {
    if (validEnvelope(value) && now - value.savedAt <= DRAFT_TTL_MS) cache.set(name.slice(COPY_PREFIX.length), value);
  }
  const plaintext = plaintextDrafts(uid, now);
  for (const [key, envelope] of plaintext) {
    if ((cache.get(key)?.savedAt ?? -1) < envelope.savedAt) cache.set(key, envelope);
  }
  encrypted = true;
  for (const [key] of plaintext) await moveToStore(key);
}

/** This user's unexpired drafts still in localStorage. */
function plaintextDrafts(uid: string, now: number): [string, DraftEnvelope][] {
  const found: [string, DraftEnvelope][] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      const envelope = key?.startsWith(ownerPrefix(uid)) ? readStoredEnvelope(key, now) : null;
      if (key && envelope) found.push([key, envelope]);
    }
  } catch { /* storage unavailable: nothing to move */ }
  return found;
}

/** Saves one draft to the store, then removes its plaintext copy. */
async function moveToStore(key: string): Promise<void> {
  const envelope = cache.get(key);
  if (!envelope || !(await saveCopy(COPY_PREFIX + key, envelope))) return;
  try {
    localStorage.removeItem(key);
  } catch { /* goes at sign-out */ }
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
  forget(generalKey(owner, institutionId, classId, date, session));
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
  forget(subjectKey(owner, institutionId, subjectId, classId, date));
}

/**
 * Removes this user's drafts for registers dated before the current term start,
 * and any that have outlived the TTL. Call on dashboard or register page mount.
 */
export function purgeExpiredDrafts(termStartDate: string): void {
  if (!owner) return;
  const now = Date.now();
  for (const [key, envelope] of [...cache]) {
    if (now - envelope.savedAt > DRAFT_TTL_MS || envelope.date < termStartDate) forget(key);
  }
  try {
    removeStorageKeysByPrefix(localStorage, ownerPrefix(owner), (k) => {
      const envelope = readStoredEnvelope(k, now); // also drops malformed / expired ones
      return envelope === null ? false : envelope.date < termStartDate;
    });
  } catch { /* non-fatal */ }
}

/**
 * Wipes every attendance draft in this browser (all users, old and new format). The encrypted copies go with the
 * offline store (sessionPurge.ts).
 */
export function clearAllDrafts(): void {
  cache.clear();
  encrypted = false;
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
