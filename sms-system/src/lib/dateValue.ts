// Turns a stored date, in whatever shape it arrives, into a "YYYY-MM-DD" string (UTC date), or ''.
// A Firestore Timestamp is recognised by its toDate() method rather than `instanceof Timestamp`,
// so it still works if the class check fails (a duplicate SDK copy, a plain object that has lost
// its prototype, a snapshot read through another path). Never throws and never returns an invalid
// date: anything it cannot read gives '', which the list pages show as a dash.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}[T ]/;

function fromObject(value: object): Date | null {
  const v = value as { toDate?: unknown; seconds?: unknown; _seconds?: unknown };
  if (typeof v.toDate === 'function') {
    try {
      const d = (v.toDate as () => unknown)();
      return d instanceof Date ? d : null;
    } catch {
      return null;
    }
  }
  const seconds = typeof v.seconds === 'number' ? v.seconds : typeof v._seconds === 'number' ? v._seconds : null;
  return seconds === null ? null : new Date(seconds * 1000);
}

export function toIsoDate(value: unknown): string {
  let date: Date | null = null;
  if (value instanceof Date) date = value;
  else if (typeof value === 'number') date = new Date(value);
  else if (typeof value === 'string') {
    const s = value.trim();
    if (DATE_ONLY.test(s)) date = new Date(`${s}T00:00:00Z`);
    else if (ISO_DATE_TIME.test(s)) date = new Date(s);
  } else if (typeof value === 'object' && value !== null) date = fromObject(value);

  if (!date || Number.isNaN(date.getTime())) return '';
  try {
    const iso = date.toISOString().slice(0, 10);
    // new Date('2026-02-31T00:00:00Z') rolls over to March; a date that is not real is not accepted.
    return typeof value === 'string' && DATE_ONLY.test(value.trim()) && iso !== value.trim() ? '' : iso;
  } catch {
    return '';
  }
}
