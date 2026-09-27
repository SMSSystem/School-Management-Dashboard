import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useInstitutionTerms } from '@/hooks/useInstitutionTerms';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { getPersistedCurrentTerm, setPersistedCurrentTerm } from '@/lib/filterPersistence';
import { createRequiredContext } from './createRequiredContext';

/**
 * App-wide "current term" (DEV_NOTES Item 6.2) — a single shared value read
 * and written by the five term-scoped workflow pages (Gradebook, Schedule,
 * Attendance Gridsheet, Report Card Comments, Grade-Entry Tracking), so
 * picking a term on one carries over to the others on next visit. Other pages
 * with a term selector (student detail lookup, report-card/report-builder
 * generation panels) only read this as their initial default — see each
 * page's own comment for why they don't write back.
 *
 * Backed by sessionStorage via filterPersistence.ts's dedicated
 * getPersistedCurrentTerm/setPersistedCurrentTerm — reusing Item 6.1's
 * clear-on-logout sweep rather than adding a separate AuthContext hook.
 */

type CurrentTermContextValue = {
  currentTermId: string;
  setCurrentTermId: (termId: string) => void;
};

const [CurrentTermContext, useCurrentTerm] =
  createRequiredContext<CurrentTermContextValue>('useCurrentTerm', 'a CurrentTermProvider');

export function CurrentTermProvider({ children }: { children: ReactNode }) {
  const [currentTermId, setCurrentTermId] = useState(() => getPersistedCurrentTerm());
  const { data: terms } = useInstitutionTerms();
  // Only ever non-empty for calendarMode === 'custom' institutions (§3.1) —
  // for calendarMode === 'academic_year' this is always [], so the fallback
  // below is unchanged from before this hook existed.
  const { activeTimeBlocks } = useInstitutionAcademicCalendar();

  useEffect(() => {
    setPersistedCurrentTerm(currentTermId);
  }, [currentTermId]);

  // Keeps currentTermId valid and defaulted, for as long as the institution's
  // terms are cached: if the current value still exists, leave it alone
  // (including a value the user just picked); otherwise fall back to the
  // confirmed default-selection rule (§3): most-recently-created first,
  // soonest-ending tie-break — activeTimeBlocks is already sorted this way.
  // Only falls through to the old single-active-term .find() for
  // academic-mode institutions, which can have at most one anyway.
  useEffect(() => {
    if (!terms) return;
    setCurrentTermId((prev) => {
      if (prev && terms.some((t) => t.id === prev)) return prev;
      if (activeTimeBlocks.length > 0) return activeTimeBlocks[0].term.id;
      const active = terms.find((t) => t.status === 'active');
      return active ? active.id : '';
    });
  }, [terms, activeTimeBlocks]);

  const value = useMemo(
    () => ({ currentTermId, setCurrentTermId }),
    [currentTermId],
  );

  return (
    <CurrentTermContext.Provider value={value}>
      {children}
    </CurrentTermContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export { useCurrentTerm };
