import { describe, expect, it } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import { toIsoDate } from '../dateValue';
import { formatDate } from '../formatDate';
import feedbackRaw from '../../scenes/(dashboard)/list/feedback/index.tsx?raw';

// The Feedback list showed "Invalid Date" for every row although the stored createdAt is a real
// Timestamp: its page-local conversion relied on `instanceof Timestamp` and fell back to slicing
// the text of the object. toIsoDate reads a Timestamp by its toDate() method instead.

const feedback = feedbackRaw.split('\r\n').join('\n');

describe('toIsoDate', () => {
  it('reads a real Firestore Timestamp', () => {
    expect(toIsoDate(Timestamp.fromDate(new Date('2026-10-12T14:00:00Z')))).toBe('2026-10-12');
  });

  it('reads anything with a toDate() method, so a failed instanceof check cannot break it', () => {
    expect(toIsoDate({ toDate: () => new Date('2026-10-12T14:00:00Z') })).toBe('2026-10-12');
  });

  it('reads a plain {seconds} or {_seconds} timestamp object', () => {
    expect(toIsoDate({ seconds: 1760277600, nanoseconds: 0 })).toBe('2025-10-12');
    expect(toIsoDate({ _seconds: 1760277600, _nanoseconds: 0 })).toBe('2025-10-12');
  });

  it('reads a Date, milliseconds, a date-only string and an ISO date-time string', () => {
    expect(toIsoDate(new Date('2026-09-07T12:00:00Z'))).toBe('2026-09-07');
    expect(toIsoDate(Date.UTC(2026, 8, 7, 12))).toBe('2026-09-07');
    expect(toIsoDate('2026-10-12')).toBe('2026-10-12');
    expect(toIsoDate('2026-10-12T14:00:00.000Z')).toBe('2026-10-12');
    expect(toIsoDate(' 2026-10-12 ')).toBe('2026-10-12');
  });

  it('gives an empty string, never an invalid date, for anything it cannot read', () => {
    const bad: unknown[] = [
      'Timestamp(seconds=1760277600, nanoseconds=0)',
      'not a date',
      '2026-02-31',
      '2026-13-01',
      '',
      NaN,
      new Date('nope'),
      null,
      undefined,
      {},
      [],
      true,
      { toDate: () => 'x' },
      {
        toDate: () => {
          throw new Error('boom');
        },
      },
      { seconds: 'x' },
    ];
    for (const v of bad) expect(toIsoDate(v), String(JSON.stringify(v))).toBe('');
  });

  it('feeds formatDate safely: a good value is formatted, a bad one is a dash', () => {
    expect(formatDate(toIsoDate({ toDate: () => new Date('2026-10-12T14:00:00Z') }))).toBe('October 12, 2026');
    expect(formatDate(toIsoDate('Timestamp(seconds=1, nanoseconds=0)'))).toBe('—');
  });
});

describe('the Feedback page date', () => {
  it('no longer depends on instanceof Timestamp, and shows a dash when there is no date', () => {
    expect(feedback).not.toContain('instanceof Timestamp');
    expect(feedback).not.toContain('import { Timestamp }');
    expect(feedback).toContain('createdAt: toIsoDate(raw.createdAt),');
    expect(feedback).toContain('formatDate(toIsoDate(item.createdAt))');
  });
});
