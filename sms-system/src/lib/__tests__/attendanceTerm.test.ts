import { describe, expect, it } from 'vitest';
import { resolveAttendanceTerm, type AttendanceTerm } from '../attendanceTerm';

const term = (id: string): AttendanceTerm => ({ id, name: `Term ${id}`, startDate: '2026-09-01', endDate: '2026-12-18' });
const block = (id: string) => ({ term: term(id) });

describe('resolveAttendanceTerm', () => {
  it('uses the single active term in academic mode', () => {
    const r = resolveAttendanceTerm({ isCustomMode: false, activeTerm: term('a'), activeTimeBlocks: [] });
    expect(r).toEqual({ term: term('a'), needsPicker: false });
  });

  it('returns no term in academic mode when none is active', () => {
    expect(resolveAttendanceTerm({ isCustomMode: false, activeTerm: null, activeTimeBlocks: [] }).term).toBeNull();
  });

  it('uses the class\'s own block in custom mode, with no picker', () => {
    const r = resolveAttendanceTerm({
      isCustomMode: true,
      activeTerm: null,
      activeTimeBlocks: [block('x'), block('y')],
      classTermId: 'y',
    });
    expect(r).toEqual({ term: term('y'), needsPicker: false });
  });

  it('falls back to a picker when the class\'s block is not active', () => {
    const blocks = [block('x'), block('y')];
    const base = { isCustomMode: true, activeTerm: null, activeTimeBlocks: blocks, classTermId: 'gone' };
    expect(resolveAttendanceTerm(base)).toEqual({ term: term('x'), needsPicker: true });
    expect(resolveAttendanceTerm({ ...base, selectedTermId: 'y' })).toEqual({ term: term('y'), needsPicker: true });
  });

  it('needs no picker with a single fallback block, and no term with none', () => {
    expect(
      resolveAttendanceTerm({ isCustomMode: true, activeTerm: null, activeTimeBlocks: [block('x')], classTermId: 'gone' }),
    ).toEqual({ term: term('x'), needsPicker: false });
    expect(resolveAttendanceTerm({ isCustomMode: true, activeTerm: null, activeTimeBlocks: [] }).term).toBeNull();
  });
});
