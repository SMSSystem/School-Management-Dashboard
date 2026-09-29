import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { computeDeleteAt, computeStatus } from '../submissionRetention';

// These two functions must compute byte-identical results to
// firestore.rules' expectedDeleteAt()/expectedSubmissionStatus() (same
// fixed-182-day-duration definition, no calendar-month arithmetic) — a
// mismatch here would reject every real student submission at write time,
// since the rule re-derives deleteAt/status from submittedAt and checks
// them against what the client actually sent via exact equality.

const SIX_MONTHS_MS = 182 * 24 * 60 * 60 * 1000;

describe('computeDeleteAt', () => {
  it('anchors to dueDate + 182d for an on-time submission', () => {
    const dueDate = Timestamp.fromMillis(1_700_000_000_000);
    const submittedAt = Timestamp.fromMillis(1_700_000_000_000 - 24 * 60 * 60 * 1000); // 1 day early
    const result = computeDeleteAt(dueDate, submittedAt);
    expect(result.toMillis()).toBe(dueDate.toMillis() + SIX_MONTHS_MS);
  });

  it('floors at submittedAt + 182d for a submission made well after the 182-day anchor has passed', () => {
    const dueDate = Timestamp.fromMillis(1_700_000_000_000);
    // 200 days late — dueDate + 182d has already passed relative to submittedAt.
    const submittedAt = Timestamp.fromMillis(dueDate.toMillis() + 200 * 24 * 60 * 60 * 1000);
    const result = computeDeleteAt(dueDate, submittedAt);
    expect(result.toMillis()).toBe(submittedAt.toMillis() + SIX_MONTHS_MS);
    // Guarantees a full 182-day window regardless of how late the submission was.
    expect(result.toMillis() - submittedAt.toMillis()).toBe(SIX_MONTHS_MS);
  });

  it('resolves to the same instant on-time submissions of the same assignment share, regardless of small submittedAt differences', () => {
    const dueDate = Timestamp.fromMillis(1_700_000_000_000);
    const earlySubmit = Timestamp.fromMillis(dueDate.toMillis() - 10 * 24 * 60 * 60 * 1000);
    const lastMinuteSubmit = Timestamp.fromMillis(dueDate.toMillis() - 1000);
    expect(computeDeleteAt(dueDate, earlySubmit).toMillis()).toBe(
      computeDeleteAt(dueDate, lastMinuteSubmit).toMillis(),
    );
  });
});

describe('computeStatus', () => {
  it('is "submitted" when submittedAt is before dueDateTimestamp', () => {
    const dueDate = Timestamp.fromMillis(1_700_000_000_000);
    const submittedAt = Timestamp.fromMillis(dueDate.toMillis() - 1);
    expect(computeStatus(dueDate, submittedAt)).toBe('submitted');
  });

  it('is "submitted" at the exact due-date boundary (strict > only, no false positive on equality)', () => {
    const dueDate = Timestamp.fromMillis(1_700_000_000_000);
    expect(computeStatus(dueDate, dueDate)).toBe('submitted');
  });

  it('is "late" when submittedAt is even one millisecond after dueDateTimestamp', () => {
    const dueDate = Timestamp.fromMillis(1_700_000_000_000);
    const submittedAt = Timestamp.fromMillis(dueDate.toMillis() + 1);
    expect(computeStatus(dueDate, submittedAt)).toBe('late');
  });
});
