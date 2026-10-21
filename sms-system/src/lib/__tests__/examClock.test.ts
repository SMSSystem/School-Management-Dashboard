import { describe, expect, it } from 'vitest';
import {
  MIN_ATTEMPT_MS,
  START_MARGIN_MS,
  UNKNOWN_CLOCK_MARGIN_MS,
  formatRemaining,
  hasTimeToStart,
  offsetFromDateHeader,
  startDeadlineMs,
  timerAnnouncement,
} from '../examClock';

// The clock of an attempt (EXAMS_FEATURE_SPEC.md §4.5 and §13).

const T = Date.UTC(2026, 9, 22, 14, 0, 0);
const MIN = 60_000;

describe('offsetFromDateHeader', () => {
  it('is the server time minus the device time', () => {
    const header = new Date(T).toUTCString();
    expect(offsetFromDateHeader(header, T - 5 * MIN)).toBe(5 * MIN);
    expect(offsetFromDateHeader(header, T + 90_000)).toBe(-90_000);
    expect(offsetFromDateHeader(header, T)).toBe(0);
  });

  it('is null for a missing or unreadable header', () => {
    expect(offsetFromDateHeader(null, T)).toBeNull();
    expect(offsetFromDateHeader(undefined, T)).toBeNull();
    expect(offsetFromDateHeader('', T)).toBeNull();
    expect(offsetFromDateHeader('yesterday-ish', T)).toBeNull();
  });
});

describe('startDeadlineMs', () => {
  const base = { durationMinutes: 45, closesAtMs: T + 8 * 60 * MIN };

  it('is the server start plus the duration, less the margin, whatever the device clock says', () => {
    // The device is 10 minutes ahead of the server (offset -10 min): the deadline follows the server.
    const ahead = startDeadlineMs({ ...base, clientNowMs: T + 10 * MIN, offsetMs: -10 * MIN });
    expect(ahead).toBe(T + 45 * MIN - START_MARGIN_MS);
    const behind = startDeadlineMs({ ...base, clientNowMs: T - 10 * MIN, offsetMs: 10 * MIN });
    expect(behind).toBe(T + 45 * MIN - START_MARGIN_MS);
  });

  it('adds the extra time', () => {
    expect(startDeadlineMs({ ...base, clientNowMs: T, offsetMs: 0, extraMinutes: 15 })).toBe(T + 60 * MIN - START_MARGIN_MS);
  });

  it('stops at the close plus the extra time when the student starts late', () => {
    const closing = { durationMinutes: 45, closesAtMs: T + 20 * MIN };
    expect(startDeadlineMs({ ...closing, clientNowMs: T, offsetMs: 0 })).toBe(T + 20 * MIN - START_MARGIN_MS);
    expect(startDeadlineMs({ ...closing, clientNowMs: T, offsetMs: 0, extraMinutes: 10 })).toBe(T + 30 * MIN - START_MARGIN_MS);
  });

  it('keeps a wide margin when the server time could not be read', () => {
    expect(startDeadlineMs({ ...base, clientNowMs: T, offsetMs: null })).toBe(T + 45 * MIN - UNKNOWN_CLOCK_MARGIN_MS);
  });

  it('never lets the deadline pass what the rule allows, for any offset error up to the margin', () => {
    // The rule: deadline <= request.time + duration. request.time is the real server time at the write.
    for (const error of [0, 500, 1000, 1999]) {
      const believedServer = T - error; // the header reads behind the real server time
      const deadline = startDeadlineMs({ ...base, clientNowMs: T, offsetMs: believedServer - T });
      expect(deadline).toBeLessThanOrEqual(T + 45 * MIN);
    }
  });
});

describe('hasTimeToStart', () => {
  it('needs at least 30 seconds', () => {
    expect(hasTimeToStart(T + MIN_ATTEMPT_MS, T)).toBe(true);
    expect(hasTimeToStart(T + MIN_ATTEMPT_MS - 1, T)).toBe(false);
  });
});

describe('formatRemaining', () => {
  it('shows minutes and seconds, and hours from an hour up', () => {
    expect(formatRemaining(45 * MIN)).toBe('45:00');
    expect(formatRemaining(9 * MIN + 5_000)).toBe('9:05');
    expect(formatRemaining(61 * MIN + 1_000)).toBe('1:01:01');
    expect(formatRemaining(3 * 60 * MIN)).toBe('3:00:00');
  });

  it('rounds up to the next second and never goes below zero', () => {
    expect(formatRemaining(1)).toBe('0:01');
    expect(formatRemaining(1_001)).toBe('0:02');
    expect(formatRemaining(0)).toBe('0:00');
    expect(formatRemaining(-5_000)).toBe('0:00');
  });
});

describe('timerAnnouncement', () => {
  it('says nothing while there is plenty of time', () => {
    expect(timerAnnouncement(20 * MIN, [])).toBeNull();
    expect(timerAnnouncement(10 * MIN + 1_000, [])).toBeNull();
  });

  it('announces each threshold once as it is reached', () => {
    const first = timerAnnouncement(10 * MIN, []);
    expect(first?.message).toBe('10 minutes left');
    expect(timerAnnouncement(9 * MIN, first!.mark)).toBeNull();
    const five = timerAnnouncement(5 * MIN, first!.mark);
    expect(five?.message).toBe('5 minutes left');
    expect(timerAnnouncement(MIN, five!.mark)?.message).toBe('1 minute left');
    expect(timerAnnouncement(30_000, [600, 300, 60])?.message).toBe('30 seconds left');
  });

  it('announces only the latest threshold when a sleeping tab wakes late, and marks the earlier ones', () => {
    const woke = timerAnnouncement(20_000, []);
    expect(woke?.message).toBe('30 seconds left');
    expect(woke?.mark).toEqual([600, 300, 60, 30]);
    expect(timerAnnouncement(10_000, woke!.mark)).toBeNull();
  });
});
