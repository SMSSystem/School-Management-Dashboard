import { cleanEvents, type LocalDraft } from './examAttemptLogic';
import { removeStorageKeysByPrefix } from './storagePrefixScan';

// A student's answers kept in the browser between checkpoints (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.5),
// so a refresh or a crash loses nothing since the last keystroke. Like the attendance drafts it lives in localStorage,
// which outlives the tab, so:
//   - the key carries the signed-in uid, and only that user's copy is ever read;
//   - the value carries `savedAt` and expires after 24 hours;
//   - it is removed when the attempt is submitted, on every sign-out (sessionPurge.ts) and, at sign-in, when it
//     belongs to anyone else.
// Never fatal: storage that is full or blocked just means no backup.

const PREFIX = 'exam_answers:';
export const EXAM_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

type Envelope = LocalDraft & { savedAt: number };

const keyFor = (uid: string, institutionId: string, examId: string) => `${PREFIX}${uid}:${institutionId}:${examId}`;

const isStringArrayMap = (v: unknown): v is Record<string, string[]> =>
  typeof v === 'object' && v !== null && Object.values(v).every((x) => Array.isArray(x) && x.every((s) => typeof s === 'string'));

const isNumberMap = (v: unknown): v is Record<string, number> =>
  typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => typeof x === 'number' && Number.isFinite(x));

/** The saved copy for this account and exam, or null (none, expired, malformed or unreadable). */
export function readExamDraft(uid: string, institutionId: string, examId: string, nowMs: number = Date.now()): LocalDraft | null {
  if (!uid) return null;
  const key = keyFor(uid, institutionId, examId);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Envelope> | null;
    if (
      !parsed ||
      typeof parsed.savedAt !== 'number' ||
      nowMs - parsed.savedAt > EXAM_DRAFT_TTL_MS ||
      !isStringArrayMap(parsed.answers) ||
      !Array.isArray(parsed.flags) ||
      !parsed.flags.every((f) => typeof f === 'string') ||
      typeof parsed.tabSwitches !== 'number' ||
      typeof parsed.baseLastSavedMs !== 'number'
    ) {
      localStorage.removeItem(key);
      return null;
    }
    return {
      answers: parsed.answers,
      flags: parsed.flags,
      tabSwitches: parsed.tabSwitches,
      baseLastSavedMs: parsed.baseLastSavedMs,
      // A backup from before the activity log has neither; a malformed log is dropped, not the whole backup.
      ...(Array.isArray(parsed.events) && { events: cleanEvents(parsed.events) }),
      ...(isNumberMap(parsed.answeredAt) && { answeredAt: parsed.answeredAt }),
    };
  } catch {
    return null;
  }
}

export function writeExamDraft(uid: string, institutionId: string, examId: string, draft: LocalDraft, nowMs: number = Date.now()): void {
  if (!uid) return;
  const envelope: Envelope = { ...draft, savedAt: nowMs };
  try {
    localStorage.setItem(keyFor(uid, institutionId, examId), JSON.stringify(envelope));
  } catch {
    // Quota or storage unavailable: the backup is a convenience.
  }
}

export function clearExamDraft(uid: string, institutionId: string, examId: string): void {
  if (!uid) return;
  try {
    localStorage.removeItem(keyFor(uid, institutionId, examId));
  } catch {
    /* non-fatal */
  }
}

/** Wipes every exam backup in this browser (all accounts). Called on every sign-out. */
export function clearAllExamDrafts(): void {
  try {
    removeStorageKeysByPrefix(localStorage, PREFIX);
  } catch {
    /* non-fatal */
  }
}

/** At sign-in: drop backups left by any other account. */
export function dropForeignExamDrafts(uid: string): void {
  try {
    const mine = `${PREFIX}${uid}:`;
    removeStorageKeysByPrefix(localStorage, PREFIX, (k) => !k.startsWith(mine));
  } catch {
    /* non-fatal */
  }
}
