import { computeDeadlineMs } from './examTiming';

// The clock of an attempt (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §4.5 and §13). A student's device clock may
// be minutes out, so the countdown runs from the deadline the server accepted and an offset to the server's time.
// Creating an attempt needs its deadline before the write, and the rules refuse a deadline later than
// `request.time + duration`, so the server's time comes from the Realtime Database's `.info/serverTimeOffset` (free:
// the session lock already holds that connection) and the deadline is set a little inside the computed one. Pure and
// Firebase-free; times are milliseconds since 1970.

/** How far inside the computed deadline a start is set when the server's time is known (covers the offset's error). */
export const START_MARGIN_MS = 2_000;
/** The margin when the server's time could not be read and the device clock has to be trusted. */
export const UNKNOWN_CLOCK_MARGIN_MS = 60_000;
/** A start with less than this left is refused: the student would have no time to answer. */
export const MIN_ATTEMPT_MS = 30_000;

/** A usable offset (serverNow − clientNow, in ms) from whatever the database reported, or null. */
export function cleanOffset(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

// A local backup is stamped a little after the server time it was made at, so it is never mistaken for older than the
// checkpoint it follows (see mergeLocalDraft).
const DRAFT_BASE_PAD_MS = 60_000;

/** The `baseLastSavedMs` of a local backup made now, after a checkpoint or a start has been acknowledged. */
export function localDraftBaseMs(clientNowMs: number, offsetMs: number | null): number {
  return clientNowMs + (offsetMs ?? 0) + DRAFT_BASE_PAD_MS;
}

/**
 * The deadline to write when an attempt starts: the start plus the duration plus any extra time (never past the close
 * plus the same extra time), by the server's clock, less a safety margin so the rule that compares it with
 * `request.time` accepts it.
 */
export function startDeadlineMs(input: {
  clientNowMs: number;
  offsetMs: number | null;
  durationMinutes: number;
  extraMinutes?: number;
  closesAtMs: number;
}): number {
  const serverNowMs = input.clientNowMs + (input.offsetMs ?? 0);
  const deadline = computeDeadlineMs({
    startedAtMs: serverNowMs,
    durationMinutes: input.durationMinutes,
    extraMinutes: input.extraMinutes,
    closesAtMs: input.closesAtMs,
  });
  return deadline - (input.offsetMs === null ? UNKNOWN_CLOCK_MARGIN_MS : START_MARGIN_MS);
}

/** Is there enough time left from `nowMs` (the server's time) to be worth starting? */
export function hasTimeToStart(deadlineMs: number, serverNowMs: number): boolean {
  return deadlineMs - serverNowMs >= MIN_ATTEMPT_MS;
}

/** `m:ss`, or `h:mm:ss` from an hour up; rounded up to the next second and never negative. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}

// When the timer speaks (a live region announces these, not every second).
export const ANNOUNCE_AT_SECONDS = [600, 300, 60, 30] as const;

const SPOKEN: Record<number, string> = {
  600: '10 minutes left',
  300: '5 minutes left',
  60: '1 minute left',
  30: '30 seconds left',
};

/**
 * What to announce now, if anything: the smallest threshold that has been reached and not yet announced. `mark` lists
 * every threshold reached, so a tab that wakes up with 20 seconds left says "30 seconds left" once, not four things.
 */
export function timerAnnouncement(
  remainingMs: number,
  announced: readonly number[],
): { message: string; mark: number[] } | null {
  const seconds = remainingMs / 1000;
  const reached = ANNOUNCE_AT_SECONDS.filter((t) => seconds <= t);
  const fresh = reached.filter((t) => !announced.includes(t));
  if (fresh.length === 0) return null;
  const smallest = Math.min(...fresh);
  return { message: SPOKEN[smallest], mark: [...reached] };
}
