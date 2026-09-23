import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useInstitutionTerms } from '@/hooks/useInstitutionTerms';
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

  useEffect(() => {
    setPersistedCurrentTerm(currentTermId);
  }, [currentTermId]);

  // Keeps currentTermId valid and defaulted, for as long as the institution's
  // terms are cached: if the current value still exists, leave it alone
  // (including a value the user just picked); otherwise fall back to the
  // institution's active term (or "" if there isn't one).
  useEffect(() => {
    if (!terms) return;
    setCurrentTermId((prev) => {
      if (prev && terms.some((t) => t.id === prev)) return prev;
      const active = terms.find((t) => t.status === 'active');
      return active ? active.id : '';
    });
  }, [terms]);

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
