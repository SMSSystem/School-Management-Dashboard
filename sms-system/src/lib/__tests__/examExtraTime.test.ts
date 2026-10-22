import { describe, expect, it } from 'vitest';
import { extraTimePlan } from '../examExtraTime';

// Extra time for one student (EXAMS_FEATURE_SPEC.md §5.6, §4.7).

const T = Date.UTC(2026, 9, 22, 15, 0, 0);
const MIN = 60_000;

describe('extraTimePlan', () => {
  it('accepts 1 to 120 whole minutes only', () => {
    for (const extra of [0, -5, 121, 1.5, Number.NaN]) {
      const plan = extraTimePlan({ extraMinutes: extra, attempt: null });
      expect(plan.ok).toBe(false);
    }
    expect(extraTimePlan({ extraMinutes: 1, attempt: null }).ok).toBe(true);
    expect(extraTimePlan({ extraMinutes: 120, attempt: null }).ok).toBe(true);
  });

  it('only records the accommodation when the student has not started or has finished', () => {
    expect(extraTimePlan({ extraMinutes: 15, attempt: null })).toEqual({ ok: true, extraMinutes: 15, attempt: null });
    expect(extraTimePlan({ extraMinutes: 15, attempt: { status: 'submitted', deadlineAtMs: T, extraMinutes: 0 } })).toEqual({
      ok: true,
      extraMinutes: 15,
      attempt: null,
    });
  });

  it('moves the deadline of a running attempt by the extra minutes added', () => {
    const plan = extraTimePlan({ extraMinutes: 15, attempt: { status: 'in_progress', deadlineAtMs: T + 20 * MIN, extraMinutes: 0 } });
    expect(plan).toEqual({ ok: true, extraMinutes: 15, attempt: { deadlineAtMs: T + 35 * MIN, extraMinutes: 15 } });
  });

  it('adds only the difference when the student already had some extra time', () => {
    const plan = extraTimePlan({ extraMinutes: 20, attempt: { status: 'in_progress', deadlineAtMs: T + 20 * MIN, extraMinutes: 10 } });
    expect(plan).toEqual({ ok: true, extraMinutes: 20, attempt: { deadlineAtMs: T + 30 * MIN, extraMinutes: 20 } });
  });

  it('changes nothing on the attempt when the extra time is unchanged, and refuses to take time away', () => {
    const running = { status: 'in_progress' as const, deadlineAtMs: T + 20 * MIN, extraMinutes: 10 };
    expect(extraTimePlan({ extraMinutes: 10, attempt: running })).toEqual({ ok: true, extraMinutes: 10, attempt: null });
    expect(extraTimePlan({ extraMinutes: 5, attempt: running }).ok).toBe(false);
  });

  it('stays inside what the rules allow: a longer deadline, up to 120 minutes more, and extra time never lower', () => {
    const plan = extraTimePlan({ extraMinutes: 120, attempt: { status: 'in_progress', deadlineAtMs: T, extraMinutes: 1 } });
    expect(plan.ok && plan.attempt && plan.attempt.deadlineAtMs - T).toBe(119 * MIN);
    expect(plan.ok && plan.attempt && plan.attempt.deadlineAtMs > T).toBe(true);
  });
});
