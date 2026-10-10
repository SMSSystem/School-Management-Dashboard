import { describe, expect, it } from 'vitest';
import {
  activeTerms,
  daysWithSlots,
  formatTimeRange,
  slotEnd,
  slotStatuses,
  slotsForDay,
  subjectColor,
  todayKey,
  type SlotLike,
} from '../scheduleDay';

const slot = (over: Partial<SlotLike>): SlotLike => ({
  id: 's',
  subjectName: 'Maths',
  days: ['mon'],
  startTime: '09:00',
  duration: 45,
  ...over,
});

// 2026-10-07 is a Wednesday.
const at = (h: number, m = 0) => new Date(2026, 9, 7, h, m);

describe('activeTerms', () => {
  const term = (id: string, startDate: string, endDate: string) => ({ id, startDate, endDate });

  it('uses every active time block in custom mode, in the given order', () => {
    const blocks = [
      { term: term('b1', '2026-09-01', '2026-12-18') },
      { term: term('b2', '2026-10-01', '2026-11-30') },
    ];
    expect(activeTerms(blocks, null)).toEqual([
      { id: 'b1', start: '2026-09-01', end: '2026-12-18' },
      { id: 'b2', start: '2026-10-01', end: '2026-11-30' },
    ]);
  });

  it('uses the in-session term in academic mode', () => {
    expect(activeTerms([], term('t1', '2026-09-01', '2026-12-18'))).toEqual([
      { id: 't1', start: '2026-09-01', end: '2026-12-18' },
    ]);
  });

  it('prefers time blocks over a stray academic term', () => {
    const blocks = [{ term: term('b1', '2026-09-01', '2026-12-18') }];
    expect(activeTerms(blocks, term('t1', '2026-01-01', '2026-03-01')).map((t) => t.id)).toEqual(['b1']);
  });

  it('is empty when nothing is active', () => {
    expect(activeTerms([], null)).toEqual([]);
  });
});

describe('todayKey', () => {
  it('maps weekdays and falls back to Monday on Sunday', () => {
    expect(todayKey(at(8))).toBe('wed');
    expect(todayKey(new Date(2026, 9, 11, 8))).toBe('mon'); // Sunday
    expect(todayKey(new Date(2026, 9, 10, 8))).toBe('sat');
  });
});

describe('time helpers', () => {
  it('computes the end time, including past midnight', () => {
    expect(slotEnd('09:00', 45)).toBe('09:45');
    expect(slotEnd('23:30', 60)).toBe('00:30');
    expect(slotEnd(undefined, 30)).toBeNull();
  });

  it('formats a 12-hour range', () => {
    expect(formatTimeRange('09:00', 45)).toBe('9:00 AM – 9:45 AM');
    expect(formatTimeRange('12:30', 180)).toBe('12:30 PM – 3:30 PM');
    expect(formatTimeRange('00:15', 30)).toBe('12:15 AM – 12:45 AM');
  });
});

describe('slot grouping', () => {
  const slots = [
    slot({ id: 'b', days: ['mon', 'tue'], startTime: '13:00' }),
    slot({ id: 'a', days: ['mon'], startTime: '08:00' }),
    slot({ id: 'c', days: ['fri'], startTime: '10:00' }),
  ];

  it('filters a day and sorts by start time', () => {
    expect(slotsForDay(slots, 'mon').map((s) => s.id)).toEqual(['a', 'b']);
    expect(slotsForDay(slots, 'wed')).toEqual([]);
  });

  it('lists the days that have classes', () => {
    expect([...daysWithSlots(slots)].sort()).toEqual(['fri', 'mon', 'tue']);
  });
});

describe('slotStatuses', () => {
  const day = [
    slot({ id: 'one', startTime: '08:00', duration: 45 }),
    slot({ id: 'two', startTime: '09:00', duration: 45 }),
    slot({ id: 'three', startTime: '11:00', duration: 45 }),
  ];

  it('marks done / now / next / later', () => {
    expect(slotStatuses(day, at(9, 10))).toEqual({ one: 'done', two: 'now', three: 'next' });
    expect(slotStatuses(day, at(7, 0))).toEqual({ one: 'next', two: 'later', three: 'later' });
    expect(slotStatuses(day, at(12, 0))).toEqual({ one: 'done', two: 'done', three: 'done' });
  });
});

describe('subjectColor', () => {
  it('is stable per subject', () => {
    expect(subjectColor('Maths')).toBe(subjectColor('Maths'));
    expect(typeof subjectColor('Art')).toBe('string');
  });
});
