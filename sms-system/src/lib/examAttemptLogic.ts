import { EXAM_LIMITS, type ExamQuestion, type ExamSubmitReason } from '@/types/exams';
import { errorCode } from './reportError';

// What an attempt writes and shows (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.5, §5.4 and §7): the exact
// fields the attempt rules accept for a start, a checkpoint and a submit, the answers made safe to write, the
// confirm-before-submit counts, the late-start note, the merge with the local backup, and the tab-switch counter.
// Pure and Firebase-free: the caller supplies the Timestamps and server-time markers.

type Answers = Record<string, string[]>;

/** Only answered questions, only the question's own options, at most 100 questions. */
export function cleanAnswers(questions: readonly ExamQuestion[], answers: Readonly<Record<string, readonly string[]>>): Answers {
  const out: Answers = {};
  for (const q of questions.slice(0, EXAM_LIMITS.maxQuestions)) {
    const chosen = (answers[q.id] ?? []).filter((id) => q.options.some((o) => o.id === id));
    if (chosen.length > 0) out[q.id] = [...new Set(chosen)];
  }
  return out;
}

/** Only flags of questions that exist. */
export function cleanFlags(questions: readonly ExamQuestion[], flags: readonly string[]): string[] {
  const known = new Set(questions.map((q) => q.id));
  return [...new Set(flags.filter((id) => known.has(id)))];
}

/** The fields of a new attempt: exactly the keys the create rule requires, nothing else. */
export function newAttemptFields(p: {
  institutionId: string;
  uid: string;
  studentName: string;
  classId: string;
  startedAt: unknown;
  deadlineAt: unknown;
  lastSavedAt: unknown;
  extraMinutes: number;
  /** From newAttemptSeed: 8 to 64 characters. */
  seed: string;
}): Record<string, unknown> {
  return {
    institutionId: p.institutionId,
    studentId: p.uid,
    studentName: p.studentName.slice(0, 200),
    classId: p.classId,
    status: 'in_progress',
    startedAt: p.startedAt,
    deadlineAt: p.deadlineAt,
    extraMinutes: p.extraMinutes,
    seed: p.seed,
    answers: {},
    flags: [],
    tabSwitches: 0,
    lastSavedAt: p.lastSavedAt,
  };
}

/** A checkpoint: the answer fields and the save time, nothing else. */
export function checkpointFields(p: {
  questions: readonly ExamQuestion[];
  answers: Readonly<Record<string, readonly string[]>>;
  flags: readonly string[];
  tabSwitches: number;
  lastSavedAt: unknown;
}): Record<string, unknown> {
  return {
    answers: cleanAnswers(p.questions, p.answers),
    flags: cleanFlags(p.questions, p.flags),
    tabSwitches: Math.max(0, Math.floor(p.tabSwitches)),
    lastSavedAt: p.lastSavedAt,
  };
}

/** A submit: a checkpoint that also ends the attempt, with the server time as `submittedAt`. */
export function submitFields(p: {
  questions: readonly ExamQuestion[];
  answers: Readonly<Record<string, readonly string[]>>;
  flags: readonly string[];
  tabSwitches: number;
  serverTime: unknown;
  reason: Extract<ExamSubmitReason, 'student' | 'timeout'>;
}): Record<string, unknown> {
  return {
    ...checkpointFields({ ...p, lastSavedAt: p.serverTime }),
    status: 'submitted',
    submittedAt: p.serverTime,
    submitReason: p.reason,
  };
}

/** The counts the confirm dialog shows. */
export function submitSummary(
  questions: readonly ExamQuestion[],
  answers: Readonly<Record<string, readonly string[]>>,
  flags: readonly string[],
): { total: number; answered: number; unanswered: number; flagged: number } {
  const cleaned = cleanAnswers(questions, answers);
  const answered = Object.keys(cleaned).length;
  return {
    total: questions.length,
    answered,
    unanswered: questions.length - answered,
    flagged: cleanFlags(questions, flags).length,
  };
}

/**
 * Said on the start screen when the window, not the duration, limits the time: a student who starts late gets what is
 * left until the window closes (plus their extra time). Null when they have the full time.
 */
export function lateStartNote(input: {
  serverNowMs: number;
  durationMinutes: number;
  extraMinutes?: number;
  closesAtMs: number;
}): string | null {
  const extra = input.extraMinutes ?? 0;
  const full = input.durationMinutes + extra;
  const available = Math.floor((input.closesAtMs + extra * 60_000 - input.serverNowMs) / 60_000);
  if (available >= full) return null;
  return `You have ${Math.max(available, 0)} minute${available === 1 ? '' : 's'} instead of ${full}, because the exam closes before the full time is up.`;
}

export type LocalDraft = {
  answers: Answers;
  flags: string[];
  tabSwitches: number;
  /** The server's `lastSavedAt` (ms) of the checkpoint this copy was built on. */
  baseLastSavedMs: number;
};

/**
 * The answers to resume with. The local copy wins when it was built on this checkpoint or a later one; if the server
 * has been saved since (from another device), the server's copy wins. The tab-switch count never goes down. It does
 * not compare device time with server time, so a wrong device clock cannot pick the wrong copy.
 */
export function mergeLocalDraft(
  server: { answers: Answers; flags: string[]; tabSwitches: number; lastSavedMs: number },
  local: LocalDraft | null,
): { answers: Answers; flags: string[]; tabSwitches: number; usedLocal: boolean } {
  if (local && local.baseLastSavedMs >= server.lastSavedMs) {
    return {
      answers: local.answers,
      flags: local.flags,
      tabSwitches: Math.max(server.tabSwitches, local.tabSwitches),
      usedLocal: true,
    };
  }
  return {
    answers: server.answers,
    flags: server.flags,
    tabSwitches: Math.max(server.tabSwitches, local?.tabSwitches ?? 0),
    usedLocal: false,
  };
}

/**
 * One step of the tab-switch counter: the student is "away" when the page is hidden or the window has lost focus.
 * A leave is counted once, however many events it fires (blur and hidden together, a dialog and back), and again only
 * after they have come back.
 */
export function trackAway(wasAway: boolean, state: { visible: boolean; focused: boolean }): { away: boolean; counted: boolean } {
  const away = !state.visible || !state.focused;
  return { away, counted: away && !wasAway };
}

export type AttemptWriteKind = 'too_late' | 'offline' | 'other';

/**
 * What a refused or failed save, submit or start means for the student. The rules refuse a save after the deadline
 * plus a minute, and a start outside the window; both come back as permission-denied. A lost connection is a
 * different case: the student can try again.
 */
export function classifyAttemptWrite(err: unknown): AttemptWriteKind {
  const code = errorCode(err);
  if (code === 'permission-denied') return 'too_late';
  if (code === 'unavailable' || code === 'network-request-failed' || code === 'deadline-exceeded') return 'offline';
  return 'other';
}
