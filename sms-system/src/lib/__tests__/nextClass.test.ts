import { describe, expect, it } from 'vitest';
import { dayLabel, upcomingClasses, type SlotLite } from '../nextClass';

// 2026-10-07 is a Wednesday.
const wed = (h: number, m = 0) => new Date(2026, 9, 7, h, m);

const slot = (over: Partial<SlotLite>): SlotLite => ({
  id: 's1',
  termId: 't1',
  subjectName: 'Maths',
  days: ['wed'],
  startTime: '09:00',
  duration: 45,
  ...over,
});

const term = { t1: { start: '2026-09-01', end: '2026-12-18' } };

describe('upcomingClasses', () => {
  it('returns a later class today', () => {
    const [next] = upcomingClasses([slot({})], term, [], wed(8));
    expect(next.subjectName).toBe('Maths');
    expect(next.dayLabel).toBe('Today');
    expect(next.inProgress).toBe(false);
    expect(next.start).toEqual(wed(9));
    expect(next.end).toEqual(wed(9, 45));
  });

  it('flags a class already under way and drops one that has ended', () => {
    expect(upcomingClasses([slot({})], term, [], wed(9, 20))[0].inProgress).toBe(true);
    const after = upcomingClasses([slot({})], term, [], wed(10));
    expect(after[0].dayLabel).not.toBe('Today'); // next week's Wednesday
    expect(after[0].start.getDate()).toBe(14);
  });

  it('orders classes across days and labels Tomorrow', () => {
    const slots = [
      slot({ id: 'a', subjectName: 'Art', days: ['thu'], startTime: '08:00' }),
      slot({ id: 'b', subjectName: 'Bio', days: ['wed'], startTime: '13:00' }),
    ];
    const list = upcomingClasses(slots, term, [], wed(8), 2);
    expect(list.map((c) => c.subjectName)).toEqual(['Bio', 'Art']);
    expect(list[1].dayLabel).toBe('Tomorrow');
  });

  it('skips non-school days', () => {
    const list = upcomingClasses([slot({})], term, [{ start: '2026-10-07', end: '2026-10-07' }], wed(8));
    expect(list[0].start.getDate()).toBe(14);
  });

  it('ignores dates outside the slot\'s term', () => {
    const ended = { t1: { start: '2026-09-01', end: '2026-10-06' } };
    expect(upcomingClasses([slot({})], ended, [], wed(8))).toEqual([]);
  });

  it('honours the limit and skips malformed times', () => {
    const slots = [slot({ startTime: 'nope' }), slot({ id: 'x', days: ['mon', 'tue', 'wed', 'thu', 'fri'] })];
    expect(upcomingClasses(slots, term, [], wed(8), 3)).toHaveLength(3);
  });
});

describe('dayLabel', () => {
  it('says Today and Tomorrow', () => {
    expect(dayLabel(wed(15), wed(8))).toBe('Today');
    expect(dayLabel(new Date(2026, 9, 8, 9), wed(23))).toBe('Tomorrow');
  });
});
