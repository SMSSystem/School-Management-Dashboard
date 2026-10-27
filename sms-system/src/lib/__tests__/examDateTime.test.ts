import { describe, expect, it } from 'vitest';
import startScreenRaw from '../../components/exam/take/ExamStartScreen.tsx?raw';
import runningRaw from '../../hooks/useRunningAttempt.ts?raw';
import saveStatusRaw from '../examSaveStatus.ts?raw';
import previewRaw from '../../scenes/(dashboard)/list/exams/preview/index.tsx?raw';
import { formatExamClock, formatExamDateTime, formatExamWindow, jamaicaTimeNote, zoneOffsetMinutes } from '../examDateTime';

// Exam dates and times read "3:00 PM on April 14, 2026" in Jamaica time (UTC-5 all year) whatever the device's zone.

const at = (iso: string) => Date.parse(iso);

describe('formatExamDateTime', () => {
  it('writes the time, then the date in words, in Jamaica time', () => {
    expect(formatExamDateTime(at('2026-04-14T20:00:00Z'))).toBe('3:00 PM on April 14, 2026');
    expect(formatExamDateTime(at('2026-10-22T20:05:00Z'))).toBe('3:05 PM on October 22, 2026');
  });

  it('has no seconds, no slashes and only plain spaces', () => {
    const text = formatExamDateTime(at('2026-04-14T20:00:37Z'));
    expect(text).not.toMatch(/[/]|:\d\d:\d\d/);
    expect(text).not.toMatch(/[\u202f\u00a0]/);
  });

  it('uses 12 for midnight and noon, and changes the day at midnight Jamaica time (05:00 UTC)', () => {
    expect(formatExamDateTime(at('2026-04-14T17:00:00Z'))).toBe('12:00 PM on April 14, 2026');
    expect(formatExamDateTime(at('2026-04-14T05:00:00Z'))).toBe('12:00 AM on April 14, 2026');
    expect(formatExamDateTime(at('2026-04-14T04:59:00Z'))).toBe('11:59 PM on April 13, 2026');
  });

  it('reads the same in July and in January (no daylight saving)', () => {
    expect(formatExamDateTime(at('2026-07-01T20:00:00Z'))).toBe('3:00 PM on July 1, 2026');
    expect(formatExamDateTime(at('2026-01-01T20:00:00Z'))).toBe('3:00 PM on January 1, 2026');
  });
});

describe('formatExamClock', () => {
  it('is the time alone', () => {
    expect(formatExamClock(at('2026-04-14T20:00:00Z'))).toBe('3:00 PM');
    expect(formatExamClock(at('2026-04-14T14:09:00Z'))).toBe('9:09 AM');
  });
});

describe('formatExamWindow', () => {
  it('shortens the closing time when it is the same day', () => {
    expect(formatExamWindow(at('2026-10-22T20:00:00Z'), at('2026-10-22T22:00:00Z'))).toBe(
      'Opens 3:00 PM on October 22, 2026, closes 5:00 PM the same day',
    );
  });

  it('writes both in full on different days, including across a year', () => {
    expect(formatExamWindow(at('2026-10-22T20:00:00Z'), at('2026-10-23T20:00:00Z'))).toBe(
      'Opens 3:00 PM on October 22, 2026, closes 3:00 PM on October 23, 2026',
    );
    expect(formatExamWindow(at('2026-12-31T20:00:00Z'), at('2027-01-01T20:00:00Z'))).toContain('closes 3:00 PM on January 1, 2027');
  });

  it('uses the Jamaica day, not the UTC day, to decide what is the same day', () => {
    // 11 PM and 2 AM next day in Jamaica are 04:00 and 07:00 UTC on the same UTC day.
    expect(formatExamWindow(at('2026-04-14T03:00:00Z'), at('2026-04-14T07:00:00Z'))).toBe(
      'Opens 10:00 PM on April 13, 2026, closes 2:00 AM on April 14, 2026',
    );
  });

  it('shows a dash for a missing time', () => {
    expect(formatExamWindow(undefined, undefined)).toBe('Opens —, closes —');
    expect(formatExamWindow(at('2026-04-14T20:00:00Z'), undefined)).toBe('Opens 3:00 PM on April 14, 2026, closes —');
  });
});

describe('jamaicaTimeNote', () => {
  const now = at('2026-07-01T12:00:00Z');
  it('is said when the device zone differs from Jamaica, and not when it is the same clock', () => {
    expect(jamaicaTimeNote('Europe/London', now)).toBe('All times are Jamaica time.');
    expect(jamaicaTimeNote('Asia/Tokyo', now)).toBe('All times are Jamaica time.');
    expect(jamaicaTimeNote('America/New_York', now)).toBe('All times are Jamaica time.'); // UTC-4 in July
    expect(jamaicaTimeNote('America/Jamaica', now)).toBeNull();
    expect(jamaicaTimeNote('America/Bogota', now)).toBeNull();
    expect(jamaicaTimeNote('America/Panama', now)).toBeNull();
  });

  it('is not said for a zone name the browser does not know', () => {
    expect(jamaicaTimeNote('Not/AZone', now)).toBeNull();
  });

  it('works out an offset', () => {
    expect(zoneOffsetMinutes(now, 'America/Jamaica')).toBe(-300);
    expect(zoneOffsetMinutes(now, 'Europe/London')).toBe(60);
  });
});

describe('the exam screens', () => {
  it('format their times through lib/examDateTime and not with the browser default', () => {
    for (const src of [startScreenRaw, previewRaw]) {
      expect(src).toContain('@/lib/examDateTime');
      expect(src).not.toContain('toLocaleString()');
    }
    // The time of a save is worded in examSaveStatus, which the running attempt's state feeds.
    expect(saveStatusRaw).toContain("import { formatExamClock } from './examDateTime';");
    for (const src of [runningRaw, saveStatusRaw]) {
      expect(src).not.toContain('toLocaleString()');
      expect(src).not.toContain('Intl.DateTimeFormat(undefined');
    }
    expect(previewRaw).toContain('jamaicaTimeNote()');
    expect(startScreenRaw).toContain('jamaicaTimeNote()');
  });
});
