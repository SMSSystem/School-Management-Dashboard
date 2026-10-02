import { describe, expect, it } from 'vitest';
import { decideClaim, lockState, toMillis, type SessionRecord } from '../sessionLockLogic';

const mine = 'session-mine';
const other: SessionRecord = { sessionId: 'session-other', startedAt: 1_000 };

describe('decideClaim', () => {
  it('claims when there is no lock', () => {
    expect(decideClaim(null, mine, null)).toBe('claim');
  });

  it('keeps its own lock (a reload re-claims the same session)', () => {
    expect(decideClaim({ sessionId: mine, startedAt: 5 }, mine, null)).toBe('reclaim');
  });

  it("blocks another session's valid lock", () => {
    expect(decideClaim(other, mine, null)).toBe('blocked');
  });

  it('takes over a lock an administrator cleared after it started', () => {
    expect(decideClaim(other, mine, 2_000)).toBe('takeover');
  });

  it('does not take over when the clear predates the lock, or at the same instant', () => {
    expect(decideClaim(other, mine, 500)).toBe('blocked');
    expect(decideClaim(other, mine, 1_000)).toBe('blocked');
  });

  it('treats a malformed record as no lock', () => {
    expect(decideClaim({ startedAt: 1 } as unknown as SessionRecord, mine, null)).toBe('claim');
  });
});

describe('lockState', () => {
  it('is mine, missing or taken', () => {
    expect(lockState({ sessionId: mine, startedAt: 1 }, mine)).toBe('mine');
    expect(lockState(null, mine)).toBe('missing');
    expect(lockState(other, mine)).toBe('taken');
  });
});

describe('toMillis', () => {
  it('reads a Timestamp-like value and returns null for anything else', () => {
    expect(toMillis({ toMillis: () => 123 })).toBe(123);
    expect(toMillis(undefined)).toBeNull();
    expect(toMillis(null)).toBeNull();
    expect(toMillis('2026-10-02')).toBeNull();
    expect(toMillis({ seconds: 1, nanoseconds: 0 })).toBeNull();
  });
});
