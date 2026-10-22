import { EXAM_LIMITS, type ExamStatus } from '@/types/exams';

// The clock rules of an online exam (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.2, §4.5 and §7). Pure and
// Firebase-free: every time is a number of milliseconds since 1970, so tests need no Firebase and the edges
// convert Timestamps. The expressions marked "mirrors" must stay in step with firestore.rules, which enforces
// them with `request.time`; the client uses them to decide what to show and when to save.

const MINUTE_MS = 60_000;

type Window = { opensAtMs: number; closesAtMs: number };

/**
 * When an attempt ends: the start plus the duration plus any extra time, but never later than the window's close
 * plus the same extra time. Mirrors the attempt-create rule (`deadlineAt <= request.time + duration(exam.duration +
 * extra)` and `deadlineAt <= closesAt + extra`).
 */
export function computeDeadlineMs(input: {
  startedAtMs: number;
  durationMinutes: number;
  extraMinutes?: number;
  closesAtMs: number;
}): number {
  const extra = input.extraMinutes ?? 0;
  return Math.min(
    input.startedAtMs + (input.durationMinutes + extra) * MINUTE_MS,
    input.closesAtMs + extra * MINUTE_MS,
  );
}

/** May a student start an attempt now? Published, and inside the window. Mirrors the attempt-create rule. */
export function canStartAttempt(nowMs: number, exam: Window & { status?: ExamStatus }): boolean {
  return exam.status === 'published' && nowMs >= exam.opensAtMs && nowMs <= exam.closesAtMs;
}

/**
 * May a student read the questions now? Published, from the opening time until two hours after the close (so a
 * student with extra time can still read). Mirrors the questions read rule.
 */
export function canReadQuestions(nowMs: number, exam: Window & { status?: ExamStatus }): boolean {
  return (
    exam.status === 'published' &&
    nowMs >= exam.opensAtMs &&
    nowMs <= exam.closesAtMs + EXAM_LIMITS.questionsReadableAfterCloseMinutes * MINUTE_MS
  );
}

/**
 * Is it too late to save or submit? True once the deadline plus the grace has passed. Mirrors the attempt update
 * rule (`request.time <= resource.data.deadlineAt + 60 seconds`).
 */
export function isPastDeadline(nowMs: number, deadlineMs: number, graceSeconds: number = EXAM_LIMITS.submitGraceSeconds): boolean {
  return nowMs > deadlineMs + graceSeconds * 1000;
}

/** How far the device clock is behind the server (positive) or ahead of it (negative): serverNow − clientNow. */
export function serverOffsetMs(serverNowMs: number, clientNowMs: number): number {
  return serverNowMs - clientNowMs;
}

/** Milliseconds left until the deadline by the server's clock (never below 0). */
export function remainingMs(clientNowMs: number, deadlineMs: number, offsetMs = 0): number {
  return Math.max(0, deadlineMs - (clientNowMs + offsetMs));
}

export type ExamPhase = 'draft' | 'scheduled' | 'open' | 'closed' | 'finalized';

/**
 * Where an exam is, from its stored status and the clock. `closed` is derived: a published exam past its closing
 * time is closed without anyone writing anything.
 */
export function examPhase(exam: Partial<Window> & { status?: ExamStatus }, nowMs: number): ExamPhase {
  if (exam.status === 'finalized') return 'finalized';
  if (exam.status === 'closed') return 'closed';
  if (exam.status !== 'published') return 'draft';
  if (exam.closesAtMs !== undefined && nowMs > exam.closesAtMs) return 'closed';
  if (exam.opensAtMs !== undefined && nowMs < exam.opensAtMs) return 'scheduled';
  return 'open';
}

/** Is it time to save the in-progress answers? Only when something changed and the interval has passed. */
export function checkpointDue(input: { dirty: boolean; lastSavedMs: number; nowMs: number; intervalMinutes: number }): boolean {
  return input.dirty && input.nowMs - input.lastSavedMs >= input.intervalMinutes * MINUTE_MS;
}

/** How long before the deadline a sitting student's browser asks the server whether it moved (extra time was given). */
export const DEADLINE_RECHECK_MS = 60_000;

/**
 * Should the browser read the attempt's deadline from the server now? Once, when about a minute is left: staff may
 * have given extra time since the attempt started, and the countdown would otherwise end the attempt at the old
 * deadline. (The read is made again at time-up, before the automatic submit.)
 */
export function deadlineRecheckDue(remainingMs: number, alreadyChecked: boolean): boolean {
  return !alreadyChecked && remainingMs > 0 && remainingMs <= DEADLINE_RECHECK_MS;
}

/**
 * The window a new exam starts with: it opens at the exam's date and start time (08:00 when there is none), in
 * the browser's time zone, and closes after the duration plus a margin. Null for a date that is not YYYY-MM-DD.
 */
export function defaultWindow(
  date: string,
  startTime: string | undefined,
  durationMinutes: number,
  marginMinutes: number = EXAM_LIMITS.defaultCloseMarginMinutes,
): Window | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!d) return null;
  const t = /^(\d{1,2}):(\d{2})$/.exec(startTime ?? '08:00');
  if (!t) return null;
  const opens = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(t[1]), Number(t[2]));
  if (Number.isNaN(opens.getTime())) return null;
  return {
    opensAtMs: opens.getTime(),
    closesAtMs: opens.getTime() + (durationMinutes + marginMinutes) * MINUTE_MS,
  };
}
