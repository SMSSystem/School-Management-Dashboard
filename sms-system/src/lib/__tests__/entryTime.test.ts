import { describe, expect, it } from 'vitest';
import { entryTime, formatEntryDateTime } from '../entryTime';

describe('entryTime', () => {
  it('prefers the server-verified recordedAt', () => {
    const t = entryTime({
      timestamp: '2020-01-01T00:00:00.000Z',
      recordedAt: { toDate: () => new Date('2026-10-02T15:45:00.000Z') },
    });
    expect(t.verified).toBe(true);
    expect(t.text).toContain('2026');
  });

  it('falls back to the legacy client timestamp and flags it unverified', () => {
    const t = entryTime({ timestamp: '2025-03-04T10:00:00.000Z' });
    expect(t.verified).toBe(false);
    expect(t.text).toContain('2025');
  });

  it('treats a recordedAt without toDate (a restored plain object) as unverified', () => {
    const t = entryTime({ timestamp: '2025-03-04T10:00:00.000Z', recordedAt: {} as never });
    expect(t.verified).toBe(false);
  });
});

describe('formatEntryDateTime', () => {
  it('renders an em dash for a missing or invalid time', () => {
    expect(formatEntryDateTime(undefined)).toBe('—');
    expect(formatEntryDateTime('')).toBe('—');
    expect(formatEntryDateTime('not a date')).toBe('—');
  });
});
