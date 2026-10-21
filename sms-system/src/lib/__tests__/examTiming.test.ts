import { describe, expect, it } from 'vitest';
import {
  canReadQuestions,
  canStartAttempt,
  checkpointDue,
  computeDeadlineMs,
  defaultWindow,
  examPhase,
  isPastDeadline,
  remainingMs,
  serverOffsetMs,
} from '../examTiming';

// The clock rules of an online exam (EXAMS_FEATURE_SPEC.md §4.2, §4.5, §7). They mirror firestore.rules.

const MIN = 60_000;
const T0 = 1_800_000_000_000;
const window = { opensAtMs: T0, closesAtMs: T0 + 90 * MIN };

describe('computeDeadlineMs', () => {
  it('is the start plus the duration', () => {
    expect(computeDeadlineMs({ startedAtMs: T0 + 5 * MIN, durationMinutes: 45, closesAtMs: T0 + 90 * MIN })).toBe(T0 + 50 * MIN);
  });

  it('adds extra time', () => {
    expect(computeDeadlineMs({ startedAtMs: T0, durationMinutes: 45, extraMinutes: 15, closesAtMs: T0 + 90 * MIN })).toBe(T0 + 60 * MIN);
  });

  it('never runs past the close of the window (plus the same extra time)', () => {
    // Starting 70 minutes in, a 45-minute exam would end at 115 minutes: held to the close at 90.
    expect(computeDeadlineMs({ startedAtMs: T0 + 70 * MIN, durationMinutes: 45, closesAtMs: T0 + 90 * MIN })).toBe(T0 + 90 * MIN);
    expect(computeDeadlineMs({ startedAtMs: T0 + 70 * MIN, durationMinutes: 45, extraMinutes: 10, closesAtMs: T0 + 90 * MIN })).toBe(T0 + 100 * MIN);
  });

  it('treats missing extra time as none', () => {
    expect(computeDeadlineMs({ startedAtMs: T0, durationMinutes: 30, closesAtMs: T0 + 600 * MIN })).toBe(T0 + 30 * MIN);
  });
});

describe('canStartAttempt', () => {
  const published = { ...window, status: 'published' as const };

  it('is true only when published and inside the window, ends included', () => {
    expect(canStartAttempt(T0, published)).toBe(true);
    expect(canStartAttempt(T0 + 90 * MIN, published)).toBe(true);
    expect(canStartAttempt(T0 - 1, published)).toBe(false);
    expect(canStartAttempt(T0 + 90 * MIN + 1, published)).toBe(false);
  });

  it('is false for any status but published', () => {
    for (const status of ['draft', 'closed', 'finalized', undefined] as const) {
      expect(canStartAttempt(T0 + MIN, { ...window, status }), String(status)).toBe(false);
    }
  });
});

describe('canReadQuestions', () => {
  const published = { ...window, status: 'published' as const };

  it('opens at the opening time and stays open two hours after the close', () => {
    expect(canReadQuestions(T0 - 1, published)).toBe(false);
    expect(canReadQuestions(T0, published)).toBe(true);
    expect(canReadQuestions(T0 + 90 * MIN + 120 * MIN, published)).toBe(true);
    expect(canReadQuestions(T0 + 90 * MIN + 120 * MIN + 1, published)).toBe(false);
  });

  it('needs the exam to be published', () => {
    expect(canReadQuestions(T0 + MIN, { ...window, status: 'draft' })).toBe(false);
    expect(canReadQuestions(T0 + MIN, { ...window, status: 'finalized' })).toBe(false);
  });
});

describe('isPastDeadline', () => {
  it('allows a 60-second grace after the deadline', () => {
    expect(isPastDeadline(T0 + 60_000, T0)).toBe(false);
    expect(isPastDeadline(T0 + 60_001, T0)).toBe(true);
    expect(isPastDeadline(T0 - 1, T0)).toBe(false);
  });

  it('takes another grace', () => {
    expect(isPastDeadline(T0 + 5_000, T0, 5)).toBe(false);
    expect(isPastDeadline(T0 + 5_001, T0, 5)).toBe(true);
  });
});

describe('the server clock', () => {
  it('measures how far the device is from the server', () => {
    expect(serverOffsetMs(T0 + 5000, T0)).toBe(5000);
    expect(serverOffsetMs(T0, T0 + 5000)).toBe(-5000);
  });

  it('counts down by the server clock, never below zero', () => {
    const deadline = T0 + 10 * MIN;
    expect(remainingMs(T0, deadline)).toBe(10 * MIN);
    // A device clock 2 minutes behind the server: the server's view of "now" is 2 minutes later.
    expect(remainingMs(T0, deadline, 2 * MIN)).toBe(8 * MIN);
    expect(remainingMs(T0 + 20 * MIN, deadline)).toBe(0);
  });
});

describe('examPhase', () => {
  it('follows the stored status and the clock', () => {
    expect(examPhase({ status: 'draft', ...window }, T0)).toBe('draft');
    expect(examPhase({ ...window }, T0)).toBe('draft');
    expect(examPhase({ status: 'published', ...window }, T0 - 1)).toBe('scheduled');
    expect(examPhase({ status: 'published', ...window }, T0)).toBe('open');
    expect(examPhase({ status: 'published', ...window }, T0 + 90 * MIN)).toBe('open');
    expect(examPhase({ status: 'published', ...window }, T0 + 90 * MIN + 1)).toBe('closed');
    expect(examPhase({ status: 'closed', ...window }, T0)).toBe('closed');
    expect(examPhase({ status: 'finalized', ...window }, T0 - 1)).toBe('finalized');
  });

  it('treats a published exam with no window as open', () => {
    expect(examPhase({ status: 'published' }, T0)).toBe('open');
  });
});

describe('checkpointDue', () => {
  it('is due only when something changed and the interval has passed', () => {
    const base = { lastSavedMs: T0, intervalMinutes: 10 };
    expect(checkpointDue({ ...base, dirty: true, nowMs: T0 + 10 * MIN })).toBe(true);
    expect(checkpointDue({ ...base, dirty: true, nowMs: T0 + 10 * MIN - 1 })).toBe(false);
    expect(checkpointDue({ ...base, dirty: false, nowMs: T0 + 60 * MIN })).toBe(false);
  });
});

describe('defaultWindow', () => {
  it('opens at the date and start time and closes after the duration plus 15 minutes', () => {
    const opens = new Date(2026, 9, 21, 9, 30).getTime();
    expect(defaultWindow('2026-10-21', '09:30', 45)).toEqual({ opensAtMs: opens, closesAtMs: opens + 60 * MIN });
  });

  it('opens at 08:00 when there is no start time', () => {
    const opens = new Date(2026, 9, 21, 8, 0).getTime();
    expect(defaultWindow('2026-10-21', undefined, 60)?.opensAtMs).toBe(opens);
  });

  it('takes another margin', () => {
    const w = defaultWindow('2026-10-21', '10:00', 30, 5)!;
    expect(w.closesAtMs - w.opensAtMs).toBe(35 * MIN);
  });

  it('gives null for a date or time that cannot be read', () => {
    expect(defaultWindow('21/10/2026', '09:00', 45)).toBeNull();
    expect(defaultWindow('', '09:00', 45)).toBeNull();
    expect(defaultWindow('2026-10-21', 'nine', 45)).toBeNull();
  });
});
