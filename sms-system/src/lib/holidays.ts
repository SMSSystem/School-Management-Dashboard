export interface PublicHoliday {
  name: string;
  date: Date;
  source: 'public_holiday';
}

/** Easter Sunday via the Anonymous Gregorian (Meeus–Jones–Butcher) algorithm. */
export function computeEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day   = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function nthMonday(year: number, month: number, n: number): Date {
  const first = new Date(year, month - 1, 1);
  const dow = first.getDay(); // 0 = Sun
  const firstMonday = dow === 1 ? 1 : (8 - dow) % 7 + 1;
  return new Date(year, month - 1, firstMonday + (n - 1) * 7);
}

/** All Jamaican public holidays for a given calendar year. */
export function getJamaicanPublicHolidays(year: number): PublicHoliday[] {
  const easter = computeEaster(year);
  return [
    { name: "New Year's Day",      date: new Date(year, 0,  1),    source: 'public_holiday' },
    { name: 'Ash Wednesday',       date: addDays(easter, -46),     source: 'public_holiday' },
    { name: 'Good Friday',         date: addDays(easter, -2),      source: 'public_holiday' },
    { name: 'Easter Monday',       date: addDays(easter, 1),       source: 'public_holiday' },
    { name: 'National Labour Day', date: new Date(year, 4, 23),    source: 'public_holiday' },
    { name: 'Emancipation Day',    date: new Date(year, 7,  1),    source: 'public_holiday' },
    { name: 'Independence Day',    date: new Date(year, 7,  6),    source: 'public_holiday' },
    { name: 'National Heroes Day', date: nthMonday(year, 10, 3),   source: 'public_holiday' },
    { name: 'Christmas Day',       date: new Date(year, 11, 25),   source: 'public_holiday' },
    { name: 'Boxing Day',          date: new Date(year, 11, 26),   source: 'public_holiday' },
  ];
}
