import { describe, expect, it } from 'vitest';
import {
  ALL_WEEK_DAYS,
  addDuration,
  addOneYear,
  buildYearName,
  computeRemovedDays,
  defaultTermsFor,
  deriveDuration,
  formatDate,
  initialHolidaysFor,
  nextSchoolMonday,
  nextYearDraftFor,
  termStatusFor,
  toISO,
  validateCustomNonSchoolDays,
  validateHolidaysReviewed,
  validateNewNonSchoolDay,
  validateSchoolWeekDays,
  validateTerms,
  validateTimeBlock,
  validateYearDates,
  type CustomNSD,
  type WizardHoliday,
  type WizardTerm,
} from '../academicCalendarLogic';

// The Academic Calendar page's rules. Written when they were moved out of the page, so the move is pinned to
// what the page did (including a couple of month-end quirks that are the platform's date arithmetic).

describe('dates', () => {
  it('writes a date as YYYY-MM-DD and a year as "2026–2027" (with an en dash)', () => {
    expect(toISO(new Date('2026-10-05T12:00:00Z'))).toBe('2026-10-05');
    expect(buildYearName('2026-09-01', '2027-08-31')).toBe('2026–2027');
  });

  it('adds a year, and a leap day lands on 1 March', () => {
    expect(addOneYear('2026-09-01')).toBe('2027-09-01');
    expect(addOneYear('2024-02-29')).toBe('2025-03-01');
  });

  it('formats a date as month name, two-digit day and year', () => {
    expect(formatDate('2026-10-05')).toBe('October 05, 2026');
    expect(formatDate('2027-01-31')).toBe('January 31, 2027');
  });

  it('lists Monday to Saturday as the days a school week can use', () => {
    expect(ALL_WEEK_DAYS.map((d) => d.label)).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
    expect(ALL_WEEK_DAYS.map((d) => d.value)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('nextSchoolMonday', () => {
  it('keeps a Monday and moves any other day to the following Monday', () => {
    expect(nextSchoolMonday('2026-10-05', new Set())).toBe('2026-10-05'); // Monday
    expect(nextSchoolMonday('2026-10-04', new Set())).toBe('2026-10-05'); // Sunday
    expect(nextSchoolMonday('2026-09-01', new Set())).toBe('2026-09-07'); // Tuesday
    expect(nextSchoolMonday('2026-10-06', new Set())).toBe('2026-10-12'); // Tuesday
  });

  it('skips a Monday that is a public holiday, a week at a time', () => {
    expect(nextSchoolMonday('2026-09-01', new Set(['2026-09-07']))).toBe('2026-09-14');
    expect(nextSchoolMonday('2026-09-01', new Set(['2026-09-07', '2026-09-14']))).toBe('2026-09-21');
  });
});

describe('addDuration', () => {
  it('adds days, weeks and months', () => {
    expect(addDuration('2026-10-05', 3, 'days')).toBe('2026-10-08');
    expect(addDuration('2026-10-05', 10, 'weeks')).toBe('2026-12-14');
    expect(addDuration('2026-10-05', 2, 'months')).toBe('2026-12-05');
  });

  it('rolls a month-end that does not exist into the next month', () => {
    expect(addDuration('2026-01-31', 1, 'months')).toBe('2026-03-03');
  });
});

describe('deriveDuration', () => {
  it('says weeks when the span is a whole number of weeks, otherwise days', () => {
    expect(deriveDuration('2026-10-05', '2026-12-14')).toEqual({ count: 10, unit: 'weeks' });
    expect(deriveDuration('2026-10-05', '2026-10-08')).toEqual({ count: 3, unit: 'days' });
    expect(deriveDuration('2026-10-05', '2026-10-12')).toEqual({ count: 1, unit: 'weeks' });
  });

  it('never says months, and never less than one day', () => {
    expect(deriveDuration('2026-10-05', '2026-11-05')).toEqual({ count: 31, unit: 'days' });
    expect(deriveDuration('2026-10-05', '2026-10-05')).toEqual({ count: 1, unit: 'days' });
    expect(deriveDuration('2026-10-05', '2026-10-01')).toEqual({ count: 1, unit: 'days' });
  });
});

describe('defaultTermsFor', () => {
  const terms = defaultTermsFor('2026-09-01');

  it('offers three terms numbered 1 to 3, named as the platform has always named them', () => {
    expect(terms.map((t) => t.number)).toEqual([1, 2, 3]);
    expect(terms.map((t) => t.name)).toEqual(['Christmas Term', 'Easter Term', 'Summer Term']);
    expect(terms.map((t) => t.defaultName)).toEqual(['Christmas Term', 'Easter Term', 'Summer Term']);
  });

  it('starts each term on a Monday after its usual date and ends it on a fixed date', () => {
    expect(terms.map((t) => t.startDate)).toEqual(['2026-09-07', '2027-01-11', '2027-04-26']);
    expect(terms.map((t) => t.endDate)).toEqual(['2026-12-20', '2027-04-04', '2027-08-15']);
    for (const t of terms) expect(new Date(t.startDate + 'T12:00:00Z').getUTCDay(), t.name).toBe(1);
  });

  it('is based on the year the academic year starts in', () => {
    expect(defaultTermsFor('2027-09-01').map((t) => t.endDate)).toEqual(['2027-12-20', '2028-04-04', '2028-08-15']);
  });
});

describe('initialHolidaysFor', () => {
  const holidays = initialHolidaysFor('2026-09-01', '2027-08-31');

  it('lists the ten public holidays that fall inside the academic year', () => {
    expect(holidays.map((h) => h.name).sort()).toEqual(
      [
        'Ash Wednesday',
        'Boxing Day',
        'Christmas Day',
        'Easter Monday',
        'Emancipation Day',
        'Good Friday',
        'Independence Day',
        'National Heroes Day',
        'National Labour Day',
        "New Year's Day",
      ].sort(),
    );
  });

  it('numbers them from 0, offers them all as observed, and marks none as reviewed', () => {
    expect(holidays.map((h) => h.id)).toEqual(holidays.map((_, i) => i));
    expect(holidays.every((h) => h.confirmed && !h.interacted)).toBe(true);
    for (const h of holidays) expect(h.isoDate).toBe(toISO(h.date));
  });

  it('leaves out a holiday outside the dates', () => {
    const short = initialHolidaysFor('2026-09-01', '2026-11-30');
    expect(short.map((h) => h.name)).toEqual(['National Heroes Day']);
    expect(initialHolidaysFor('2026-09-01', '2026-09-30')).toEqual([]);
  });
});

describe('termStatusFor', () => {
  it('is upcoming before the start, active from the start day to the end day, and completed after', () => {
    expect(termStatusFor('2026-09-07', '2026-12-18', '2026-09-06')).toBe('upcoming');
    expect(termStatusFor('2026-09-07', '2026-12-18', '2026-09-07')).toBe('active');
    expect(termStatusFor('2026-09-07', '2026-12-18', '2026-12-18')).toBe('active');
    expect(termStatusFor('2026-09-07', '2026-12-18', '2026-12-19')).toBe('completed');
  });
});

describe('nextYearDraftFor', () => {
  it('is the same year a year on, with the same school week', () => {
    expect(nextYearDraftFor({ startDate: '2026-09-01', endDate: '2027-08-31', schoolWeekDays: [1, 2, 3] })).toEqual({
      name: '2027–2028',
      startDate: '2027-09-01',
      endDate: '2028-08-31',
      schoolWeekDays: [1, 2, 3],
    });
  });

  it('moves a leap day the same way addOneYear does', () => {
    expect(nextYearDraftFor({ startDate: '2027-09-01', endDate: '2028-02-29', schoolWeekDays: [1] }).endDate).toBe('2029-03-01');
  });
});

describe('the checks before moving on or saving', () => {
  const term = (n: 1 | 2 | 3, over: Partial<WizardTerm> = {}): WizardTerm => ({
    number: n,
    name: `Term ${n}`,
    defaultName: `Term ${n}`,
    startDate: '2026-09-07',
    endDate: '2026-12-18',
    ...over,
  });
  const holiday = (id: number, interacted: boolean): WizardHoliday => ({
    id,
    name: `H${id}`,
    date: new Date('2026-12-25T12:00:00Z'),
    isoDate: '2026-12-25',
    interacted,
    confirmed: true,
  });
  const nsd = (over: Partial<CustomNSD>): CustomNSD => ({ id: 1, type: 'single', date: '2026-10-04', startDate: '', endDate: '', reason: 'Sports day', ...over });

  it('asks for a year that ends after it starts', () => {
    const message = 'Enter valid start and end dates (end must be after start).';
    expect(validateYearDates('', '2027-08-31')).toBe(message);
    expect(validateYearDates('2026-09-01', '')).toBe(message);
    expect(validateYearDates('2026-09-01', '2026-09-01')).toBe(message);
    expect(validateYearDates('2026-09-01', '2027-08-31')).toBeNull();
  });

  it('asks for a name and an end after the start on every term, naming the first that fails', () => {
    expect(validateTerms([term(1), term(2), term(3)])).toBeNull();
    expect(validateTerms([term(1), term(2, { name: '  ' }), term(3)])).toBe('Term 2 name is required.');
    expect(validateTerms([term(1, { endDate: '2026-09-07' }), term(2, { name: '' })])).toBe('Term 1: end date must be after start date.');
    expect(validateTerms([term(1), term(2), term(3, { startDate: '' })])).toBe('Term 3: end date must be after start date.');
  });

  it('asks for at least one school day', () => {
    expect(validateSchoolWeekDays([])).toBe('Select at least one school day.');
    expect(validateSchoolWeekDays([1])).toBeNull();
  });

  it('asks for every holiday to be reviewed, and counts the ones that are not', () => {
    expect(validateHolidaysReviewed([holiday(0, true), holiday(1, true)])).toBeNull();
    expect(validateHolidaysReviewed([holiday(0, false), holiday(1, true), holiday(2, false)])).toBe(
      'Please check or uncheck each holiday before proceeding. 2 holiday(s) not reviewed.',
    );
  });

  it('checks each custom non-school day in turn: reason, date or range, and the range order', () => {
    expect(validateCustomNonSchoolDays([])).toBeNull();
    expect(validateCustomNonSchoolDays([nsd({})])).toBeNull();
    expect(validateCustomNonSchoolDays([nsd({ reason: ' ' })])).toBe('Each non-school day entry requires a reason.');
    expect(validateCustomNonSchoolDays([nsd({ date: '' })])).toBe('Each single non-school day requires a date.');
    expect(validateCustomNonSchoolDays([nsd({ type: 'range', startDate: '2026-10-12' })])).toBe('Each date range requires start and end dates.');
    expect(validateCustomNonSchoolDays([nsd({ type: 'range', startDate: '2026-10-12', endDate: '2026-10-09' })])).toBe(
      'Range end date must be on or after start date.',
    );
    expect(validateCustomNonSchoolDays([nsd({ type: 'range', startDate: '2026-10-12', endDate: '2026-10-12' })])).toBeNull();
    expect(validateCustomNonSchoolDays([nsd({}), nsd({ id: 2, reason: '' })])).toBe('Each non-school day entry requires a reason.');
  });

  it('checks a non-school day added from the management view without the range order', () => {
    const base = { type: 'single' as const, date: '2026-10-04', startDate: '', endDate: '', reason: 'Sports day' };
    expect(validateNewNonSchoolDay(base)).toBeNull();
    expect(validateNewNonSchoolDay({ ...base, reason: '' })).toBe('Reason is required.');
    expect(validateNewNonSchoolDay({ ...base, date: '' })).toBe('Date is required.');
    expect(validateNewNonSchoolDay({ ...base, type: 'range', startDate: '2026-10-12' })).toBe('Start and end dates are required.');
    expect(validateNewNonSchoolDay({ ...base, type: 'range', startDate: '2026-10-12', endDate: '2026-10-09' })).toBeNull();
  });

  describe('a new time block', () => {
    const ok = { name: 'Workshop', startDate: '2026-10-05', checkDuration: true, parsedDurationCount: 10, effectiveEndDate: '2026-12-14', schoolWeekDays: [1] };

    it('is accepted when everything is filled in', () => {
      expect(validateTimeBlock(ok)).toBeNull();
    });

    it('reports the first thing missing, in the order name, start, duration, end, days', () => {
      expect(validateTimeBlock({ ...ok, name: ' ', startDate: '', parsedDurationCount: 0 })).toBe('Time block name is required.');
      expect(validateTimeBlock({ ...ok, startDate: '', parsedDurationCount: 0 })).toBe('Start date is required.');
      expect(validateTimeBlock({ ...ok, parsedDurationCount: 0, effectiveEndDate: '' })).toBe('Duration must be a positive number.');
      expect(validateTimeBlock({ ...ok, effectiveEndDate: '' })).toBe('End date must be after the start date.');
      expect(validateTimeBlock({ ...ok, effectiveEndDate: '2026-10-05' })).toBe('End date must be after the start date.');
      expect(validateTimeBlock({ ...ok, schoolWeekDays: [] })).toBe('Select at least one session day.');
    });

    it('skips the duration check when the end date was typed instead', () => {
      expect(validateTimeBlock({ ...ok, checkDuration: false, parsedDurationCount: 0 })).toBeNull();
      expect(validateTimeBlock({ ...ok, checkDuration: true, parsedDurationCount: Number.NaN })).toBe('Duration must be a positive number.');
    });
  });
});

describe('computeRemovedDays', () => {
  it('is the days in the current list that the new list drops', () => {
    expect(computeRemovedDays([1, 2, 3], [1, 3])).toEqual([2]);
    expect(computeRemovedDays([1, 2, 3], [1, 2, 3, 4])).toEqual([]);
    expect(computeRemovedDays([1, 2], [])).toEqual([1, 2]);
  });
});
