import { EXAM_LIMITS } from '@/types/exams';

// Extra time for one student (docs/miscellaneous-specs/EXAMS_FEATURE_SPEC.md §5.6, §4.7): a teacher gives a student
// more minutes, which applies when their attempt starts, and — if they are already sitting — lengthens their running
// attempt's deadline. The rules let staff move a running attempt's `deadlineAt` forward by up to 120 minutes and raise
// its `extraMinutes` (never lower it, never above 120). Pure and Firebase-free; times are milliseconds.

const MINUTE_MS = 60_000;

export type ExtraTimePlan =
  | {
      ok: true;
      /** The accommodation to write: the student's total extra minutes. */
      extraMinutes: number;
      /** The running attempt's new fields, or null when there is no attempt in progress to lengthen. */
      attempt: { deadlineAtMs: number; extraMinutes: number } | null;
    }
  | { ok: false; error: string };

export function extraTimePlan(input: {
  /** The student's total extra minutes after this change. */
  extraMinutes: number;
  /** The student's attempt, when there is one. */
  attempt: { status: 'in_progress' | 'submitted'; deadlineAtMs: number; extraMinutes: number } | null;
}): ExtraTimePlan {
  const extra = input.extraMinutes;
  if (!Number.isInteger(extra) || extra < 1 || extra > EXAM_LIMITS.maxExtraMinutes) {
    return { ok: false, error: `Extra time must be a whole number of minutes from 1 to ${EXAM_LIMITS.maxExtraMinutes}.` };
  }
  const attempt = input.attempt;
  if (!attempt || attempt.status !== 'in_progress') return { ok: true, extraMinutes: extra, attempt: null };
  if (extra < attempt.extraMinutes) {
    return { ok: false, error: 'This student has already started with more extra time; it cannot be reduced now.' };
  }
  if (extra === attempt.extraMinutes) return { ok: true, extraMinutes: extra, attempt: null };
  return {
    ok: true,
    extraMinutes: extra,
    attempt: { deadlineAtMs: attempt.deadlineAtMs + (extra - attempt.extraMinutes) * MINUTE_MS, extraMinutes: extra },
  };
}
