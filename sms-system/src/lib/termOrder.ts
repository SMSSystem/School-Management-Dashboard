// The order terms are shown in, for the Terms page and every term dropdown (via useInstitutionTerms).
//
// Standard calendar (calendarMode 'academic_year', or not set on an older institution): chronological,
// earliest start date first; the same start date falls back to the name, A to Z.
//
// Custom calendar (calendarMode 'custom'): never by start date. A custom "time block" is one academic year
// plus one term, and blocks are meant to run at the same time and overlap (CUSTOM_CALENDAR_MODE_SPEC.md
// sections 2-3), so a start-date order would mean nothing. The calendar's own concurrent-block rule is used
// instead (the one useInstitutionAcademicCalendar applies to the active blocks): the academic year created
// most recently first, then the one ending soonest, then the name so the result is stable. A term with no
// academic year (one made on the Terms page) has no creation time and goes last.
//
// No Firebase import: cheap to unit-test, and the one place the order is decided.

export type CalendarMode = 'academic_year' | 'custom' | undefined;

type Orderable = { name: string; startDate: string; endDate: string; academicYearId?: string };

const byName = (a: Orderable, b: Orderable) => (a.name ?? '').localeCompare(b.name ?? '');

/**
 * `yearCreatedMs` maps an academic year id to its creation time in milliseconds; only the custom calendar
 * reads it. Returns a new array, never changes the one it is given, and keeps equal items in their order.
 */
export function sortTermsForCalendar<T extends Orderable>(
  terms: readonly T[],
  calendarMode: CalendarMode,
  yearCreatedMs: Readonly<Record<string, number>> = {},
): T[] {
  const copy = [...terms];
  if (calendarMode === 'custom') {
    const created = (t: T) => (t.academicYearId ? yearCreatedMs[t.academicYearId] ?? 0 : 0);
    return copy.sort((a, b) => {
      const byCreated = created(b) - created(a);
      if (byCreated !== 0) return byCreated;
      const byEnd = (a.endDate ?? '').localeCompare(b.endDate ?? '');
      return byEnd !== 0 ? byEnd : byName(a, b);
    });
  }
  return copy.sort((a, b) => {
    const byStart = (a.startDate ?? '').localeCompare(b.startDate ?? '');
    return byStart !== 0 ? byStart : byName(a, b);
  });
}
