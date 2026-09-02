import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { onSnapshot } from 'firebase/firestore';
import { useAuth } from '@/lib/AuthContext';
import { institutionCollection } from '@/lib/paths';
import { getPersistedFilter, setPersistedFilter } from '@/lib/filterPersistence';
import { USE_MOCK } from '@/lib/data';
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
 * Backed by sessionStorage via filterPersistence.ts (under a synthetic "app"
 * page key) — reusing Item 6.1's clear-on-logout sweep rather than adding a
 * separate AuthContext hook.
 */

const FILTER_PAGE = 'app';
const FILTER_KEY = 'currentTermId';

type CurrentTermContextValue = {
  currentTermId: string;
  setCurrentTermId: (termId: string) => void;
};

const [CurrentTermContext, useCurrentTerm] =
  createRequiredContext<CurrentTermContextValue>('useCurrentTerm', 'a CurrentTermProvider');

export function CurrentTermProvider({ children }: { children: ReactNode }) {
  const { institutionId } = useAuth();
  const [currentTermId, setCurrentTermId] = useState(() => getPersistedFilter(FILTER_PAGE, FILTER_KEY));

  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, FILTER_KEY, currentTermId);
  }, [currentTermId]);

  // Keeps currentTermId valid and defaulted, for as long as the institution's
  // terms are being watched: if the current value still exists, leave it
  // alone (including a value the user just picked); otherwise fall back to
  // the institution's active term (or "" if there isn't one).
  useEffect(() => {
    if (USE_MOCK || !institutionId || institutionId === '*') return;
    const unsub = onSnapshot(institutionCollection(institutionId, 'terms'), (snap) => {
      setCurrentTermId((prev) => {
        if (prev && snap.docs.some((d) => d.id === prev)) return prev;
        const active = snap.docs.find((d) => d.data().status === 'active');
        return active ? active.id : '';
      });
    });
    return unsub;
  }, [institutionId]);

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
