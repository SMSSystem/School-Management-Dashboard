import { useState, useEffect, useMemo } from 'react';
import { onSnapshot, query, where } from 'firebase/firestore';
import { AcademicYearDocument, TermDocument, NonSchoolDayDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { institutionCollection } from '@/lib/paths';

export type ActiveTimeBlock = {
  year: AcademicYearDocument & { id: string };
  term: TermDocument & { id: string };
};

// CUSTOM_CALENDAR_MODE_SPEC.md §3.1 — for calendarMode === 'custom',
// activeYear/draftYear/activeTerm/allTerms/nonSchoolDays (today's singular
// shape, assuming at most one active AcademicYearDocument at a time) stay
// null/empty, and activeTimeBlocks/nonSchoolDaysByTermId carry every
// concurrently active time block instead. For calendarMode === 'academic_year'
// (including institutions predating this field), it's the exact reverse —
// this is additive, not a breaking rewrite: existing Group A/B consumers of
// the singular shape are completely unaffected.
export function useInstitutionAcademicCalendar() {
  const { institutionId, institution } = useAuth();
  const isCustomMode = institution?.calendarMode === 'custom';

  const [activeYear,    setActiveYear]    = useState<AcademicYearDocument & { id: string } | null>(null);
  const [draftYear,     setDraftYear]     = useState<AcademicYearDocument & { id: string } | null>(null);
  const [activeTerm,    setActiveTerm]    = useState<TermDocument & { id: string } | null>(null);
  const [allTerms,      setAllTerms]      = useState<(TermDocument & { id: string })[] | null>(null);
  const [nonSchoolDays, setNonSchoolDays] = useState<(NonSchoolDayDocument & { id: string })[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [timedOut,      setTimedOut]      = useState(false);

  // Custom-mode raw collections — every concurrently active year, every term
  // in the institution (bounded in practice: one time block ≈ one term, and
  // custom-mode institutions don't accumulate the term volume a multi-decade
  // academic-mode institution would), and every currently-active non-school day.
  const [activeYears,          setActiveYears]          = useState<(AcademicYearDocument & { id: string })[]>([]);
  const [customTerms,          setCustomTerms]          = useState<(TermDocument & { id: string })[]>([]);
  const [customNonSchoolDays,  setCustomNonSchoolDays]  = useState<(NonSchoolDayDocument & { id: string })[]>([]);

  useEffect(() => {
    if (USE_MOCK || !institutionId) { setLoading(false); return; }
    if (isCustomMode) { setActiveYear(null); setDraftYear(null); return; }

    const unsub = onSnapshot(
      institutionCollection(institutionId, 'academicYears'),
      (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() } as AcademicYearDocument & { id: string }));
        setActiveYear(docs.find((y) => y.status === 'active') ?? null);
        setDraftYear(docs.find((y) => y.status === 'draft') ?? null);
      },
    );
    return unsub;
  }, [institutionId, isCustomMode]);

  useEffect(() => {
    // Guarded ahead of the `!activeYear` check below (which would otherwise
    // also be true in custom mode, since the effect above never populates
    // activeYear there) so this doesn't call setLoading(false) prematurely —
    // the custom-mode effect further down owns that timing instead.
    if (isCustomMode) { setAllTerms(null); setActiveTerm(null); setNonSchoolDays([]); return; }
    if (!activeYear || !institutionId) { setLoading(false); return; }

    const today = new Date().toISOString().slice(0, 10);

    const unsubT = onSnapshot(
      query(institutionCollection(institutionId, 'terms'), where('academicYearId', '==', activeYear.id)),
      (snap) => {
        const terms = snap.docs.map((d) => ({ id: d.id, ...d.data() } as TermDocument & { id: string }));
        setAllTerms(terms);
        setActiveTerm(
          terms.find((t) => today >= t.startDate && today <= t.endDate) ?? null,
        );
      },
    );

    const unsubD = onSnapshot(
      query(
        institutionCollection(institutionId, 'nonSchoolDays'),
        where('academicYearId', '==', activeYear.id),
        where('isActive', '==', true),
      ),
      (snap) => {
        setNonSchoolDays(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NonSchoolDayDocument & { id: string })));
        setLoading(false);
      },
    );

    return () => { unsubT(); unsubD(); };
  }, [activeYear, institutionId, isCustomMode]);

  useEffect(() => {
    if (USE_MOCK || !institutionId || !isCustomMode) return;

    const unsubYears = onSnapshot(
      query(institutionCollection(institutionId, 'academicYears'), where('status', '==', 'active')),
      (snap) => setActiveYears(snap.docs.map((d) => ({ id: d.id, ...d.data() } as AcademicYearDocument & { id: string }))),
    );
    const unsubTerms = onSnapshot(
      institutionCollection(institutionId, 'terms'),
      (snap) => setCustomTerms(snap.docs.map((d) => ({ id: d.id, ...d.data() } as TermDocument & { id: string }))),
    );
    const unsubNSD = onSnapshot(
      query(institutionCollection(institutionId, 'nonSchoolDays'), where('isActive', '==', true)),
      (snap) => {
        setCustomNonSchoolDays(snap.docs.map((d) => ({ id: d.id, ...d.data() } as NonSchoolDayDocument & { id: string })));
        setLoading(false);
      },
    );

    return () => { unsubYears(); unsubTerms(); unsubNSD(); };
  }, [institutionId, isCustomMode]);

  // Confirmed default-selection rule (§3): most-recently-created first
  // (AcademicYearDocument.createdAt desc), soonest-ending as the tie-break
  // (endDate asc). A year with no matching term (shouldn't happen given how
  // CustomTimeBlockWizard writes both atomically, but not contractually
  // guaranteed by the rules layer) is defensively excluded rather than
  // surfaced as a block with a null term.
  const activeTimeBlocks = useMemo<ActiveTimeBlock[]>(() => {
    if (!isCustomMode) return [];
    return activeYears
      .map((year) => ({ year, term: customTerms.find((t) => t.academicYearId === year.id) }))
      .filter((b): b is ActiveTimeBlock => !!b.term)
      .sort((a, b) => {
        const aMs = a.year.createdAt?.toMillis() ?? 0;
        const bMs = b.year.createdAt?.toMillis() ?? 0;
        if (aMs !== bMs) return bMs - aMs;
        return a.year.endDate.localeCompare(b.year.endDate);
      });
  }, [isCustomMode, activeYears, customTerms]);

  const nonSchoolDaysByTermId = useMemo<Record<string, (NonSchoolDayDocument & { id: string })[]>>(() => {
    if (!isCustomMode) return {};
    const map: Record<string, (NonSchoolDayDocument & { id: string })[]> = {};
    for (const block of activeTimeBlocks) {
      map[block.term.id] = customNonSchoolDays.filter((n) => n.academicYearId === block.year.id);
    }
    return map;
  }, [isCustomMode, activeTimeBlocks, customNonSchoolDays]);

  useEffect(() => {
    if (!loading) return;
    const id = setTimeout(() => setTimedOut(true), 10_000);
    return () => clearTimeout(id);
  }, [loading]);

  return {
    activeYear,
    draftYear,
    activeTerm,
    allTerms,
    nonSchoolDays,
    activeTimeBlocks,
    nonSchoolDaysByTermId,
    loading,
    timedOut,
  };
}
