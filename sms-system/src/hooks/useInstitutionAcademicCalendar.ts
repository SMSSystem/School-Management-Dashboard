import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getDocs, query, where } from 'firebase/firestore';
import { AcademicYearDocument, TermDocument, NonSchoolDayDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { DATA_MODE } from '@/lib/data';
import { institutionCollection, SUPER_ADMIN_SENTINEL } from '@/lib/paths';

export type ActiveTimeBlock = {
  year: AcademicYearDocument & { id: string };
  term: TermDocument & { id: string };
};

// ─── react-query fetch helpers ──────────────────────────────────────────────
// Backs the hook below — see
// internal/custom-calendar-related/USE_INSTITUTION_ACADEMIC_CALENDAR_CACHING_REMEDIATION_PLAN.md
// §3 for the full design. Private again now that step 3 (this change) wires
// them into the hook's own useQuery calls — same as fetchTerms()/
// fetchClasses() in the sibling hooks, which stay private for the same
// reason (nothing outside this file is meant to call them directly).

// Unfiltered — same "read everything, filter client-side" shape as
// fetchTerms()/fetchClasses() (§3.1: one shared query serves both academic-
// mode's activeYear/draftYear .find() and custom-mode's activeYearIds
// .filter(), rather than two separate server-filtered queries).
async function fetchAcademicYears(institutionId: string): Promise<(AcademicYearDocument & { id: string })[]> {
  const snap = await getDocs(institutionCollection(institutionId, 'academicYears'));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as AcademicYearDocument) }));
}

// Academic-mode shape: terms belonging to the institution's one active year.
async function fetchTermsForYear(institutionId: string, academicYearId: string): Promise<(TermDocument & { id: string })[]> {
  const snap = await getDocs(
    query(institutionCollection(institutionId, 'terms'), where('academicYearId', '==', academicYearId)),
  );
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as TermDocument) }));
}

// Splits `items` into chunks of at most `size` — used below to stay under
// Firestore's `in` operator limit (30 comparison values as of the current
// backend; https://github.com/firebase/firebase-ios-sdk/issues/11036,
// https://firebase.google.com/docs/firestore/query-data/queries). Kept local
// rather than reusing spreadsheetImport.ts's chunkWrites(), which is typed
// specifically to PendingWrite[], not generic.
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) {
    chunks.push(items.slice(start, start + size));
  }
  return chunks;
}

// Custom-mode shape (§4.2): terms scoped to the set of currently-active
// academic years, replacing the old unbounded "read every term this
// institution has ever had" query — bounded by however many time blocks are
// simultaneously active, not by how many have ever existed. `yearIds` is
// expected to already be the active-only set — this function itself does no
// status filtering.
const FIRESTORE_IN_LIMIT = 30;

async function fetchTermsForYearIds(institutionId: string, yearIds: string[]): Promise<(TermDocument & { id: string })[]> {
  if (yearIds.length === 0) return [];
  const chunks = chunk(yearIds, FIRESTORE_IN_LIMIT);
  const results = await Promise.all(
    chunks.map((ids) =>
      getDocs(query(institutionCollection(institutionId, 'terms'), where('academicYearId', 'in', ids))),
    ),
  );
  return results.flatMap((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as TermDocument) })));
}

// Covers both existing query shapes with one helper: academic-mode passes
// `academicYearId` (matches the original single-year-filtered listener);
// custom-mode omits it (matches the original isActive-only listener, which
// deliberately reads active non-school-days across every currently-active
// year at once — nonSchoolDaysByTermId's own useMemo does the per-block
// split client-side, same as it already does today).
async function fetchNonSchoolDays(
  institutionId: string,
  academicYearId?: string,
): Promise<(NonSchoolDayDocument & { id: string })[]> {
  const constraints = academicYearId
    ? [where('academicYearId', '==', academicYearId), where('isActive', '==', true)]
    : [where('isActive', '==', true)];
  const snap = await getDocs(query(institutionCollection(institutionId, 'nonSchoolDays'), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as NonSchoolDayDocument) }));
}

// Stable empty-array fallbacks — a bare `?? []` would hand out a fresh
// reference every render, defeating every useMemo downstream that depends
// on these (the exact class of bug this codebase already fixed once in
// General Attendance's schoolDays memo — same discipline applied here from
// the start rather than found later).
const EMPTY_YEARS: (AcademicYearDocument & { id: string })[] = [];
const EMPTY_TERMS: (TermDocument & { id: string })[] = [];
const EMPTY_NON_SCHOOL_DAYS: (NonSchoolDayDocument & { id: string })[] = [];

// CUSTOM_CALENDAR_MODE_SPEC.md §3.1 — for calendarMode === 'custom',
// activeYear/draftYear/activeTerm/allTerms/nonSchoolDays (today's singular
// shape, assuming at most one active AcademicYearDocument at a time) stay
// null/empty, and activeTimeBlocks/nonSchoolDaysByTermId carry every
// concurrently active time block instead. For calendarMode === 'academic_year'
// (including institutions predating this field), it's the exact reverse —
// this is additive, not a breaking rewrite: existing Group A/B consumers of
// the singular shape are completely unaffected.
//
// Internals are react-query-backed (one shared, deduplicated cache entry per
// institutionId, not a fresh onSnapshot per component instance) — see
// internal/custom-calendar-related/USE_INSTITUTION_ACADEMIC_CALENDAR_CACHING_REMEDIATION_PLAN.md.
// The exported name and return shape are unchanged so none of this hook's
// 11 call sites need to change.
export function useInstitutionAcademicCalendar() {
  const { institutionId, institution } = useAuth();
  const isCustomMode = institution?.calendarMode === 'custom';

  // institutionId === SUPER_ADMIN_SENTINEL ('*') for a signed-in super_admin,
  // who has no single institution to scope these queries to —
  // institutionCollection() itself throws on that sentinel (paths.ts), and
  // this hook is reachable from a super_admin session via CurrentTermContext
  // (mounted for every authenticated role, not just institution-scoped
  // ones). Expressed once here and reused by every query's `enabled` below,
  // replacing the old manual early-return guards duplicated across three
  // separate effects.
  const enabledBase = DATA_MODE === 'live' && !!institutionId && institutionId !== SUPER_ADMIN_SENTINEL;

  const academicYearsQuery = useQuery({
    queryKey: ['academicYears', institutionId ?? ''],
    queryFn: () => fetchAcademicYears(institutionId as string),
    enabled: enabledBase,
  });

  const allYears = academicYearsQuery.data ?? EMPTY_YEARS;

  const activeYear = !isCustomMode ? allYears.find((y) => y.status === 'active') ?? null : null;
  const draftYear = !isCustomMode ? allYears.find((y) => y.status === 'draft') ?? null : null;

  // Custom-mode-only subset — memoized since `.filter()` would otherwise
  // hand `activeTimeBlocks` below a fresh array reference every render.
  const activeYears = useMemo(
    () => (isCustomMode ? allYears.filter((y) => y.status === 'active') : EMPTY_YEARS),
    [isCustomMode, allYears],
  );
  const activeYearIds = useMemo(() => activeYears.map((y) => y.id), [activeYears]);

  const academicTermsEnabled = enabledBase && !isCustomMode && !!activeYear;
  const academicTermsQuery = useQuery({
    queryKey: ['terms', institutionId ?? '', activeYear?.id],
    queryFn: () => fetchTermsForYear(institutionId as string, activeYear!.id),
    enabled: academicTermsEnabled,
  });

  const customTermsEnabled = enabledBase && isCustomMode && activeYearIds.length > 0;
  const customTermsQuery = useQuery({
    queryKey: ['terms', institutionId ?? '', 'active-blocks', activeYearIds.join(',')],
    queryFn: () => fetchTermsForYearIds(institutionId as string, activeYearIds),
    enabled: customTermsEnabled,
  });

  // One shared query for both modes — fetchNonSchoolDays() already branches
  // internally on whether an academicYearId is passed (§3.1: combined key,
  // one query object, not two).
  const nonSchoolDaysEnabled = enabledBase && (isCustomMode || !!activeYear);
  const nonSchoolDaysQuery = useQuery({
    queryKey: ['nonSchoolDays', institutionId ?? '', isCustomMode ? 'active-blocks' : activeYear?.id ?? ''],
    queryFn: () => fetchNonSchoolDays(institutionId as string, isCustomMode ? undefined : activeYear!.id),
    enabled: nonSchoolDaysEnabled,
  });
  const rawNonSchoolDays = nonSchoolDaysQuery.data ?? EMPTY_NON_SCHOOL_DAYS;

  const allTerms = academicTermsEnabled ? academicTermsQuery.data ?? null : null;
  const nonSchoolDays = academicTermsEnabled ? rawNonSchoolDays : EMPTY_NON_SCHOOL_DAYS;
  const customTerms = customTermsEnabled ? customTermsQuery.data ?? EMPTY_TERMS : EMPTY_TERMS;
  const customNonSchoolDays = isCustomMode ? rawNonSchoolDays : EMPTY_NON_SCHOOL_DAYS;

  const activeTerm = useMemo(() => {
    if (isCustomMode || !allTerms) return null;
    const today = new Date().toISOString().slice(0, 10);
    return allTerms.find((t) => today >= t.startDate && today <= t.endDate) ?? null;
  }, [isCustomMode, allTerms]);

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

  // True as long as any query that's actually enabled for the current
  // mode/state hasn't resolved yet — mirrors the old setLoading(false)
  // placements (immediately when there's nothing to fetch, e.g. no
  // institutionId or no active year; otherwise once the relevant reads land).
  const loading =
    (enabledBase && academicYearsQuery.isPending) ||
    (academicTermsEnabled && academicTermsQuery.isPending) ||
    (customTermsEnabled && customTermsQuery.isPending) ||
    (nonSchoolDaysEnabled && nonSchoolDaysQuery.isPending);

  const [timedOut, setTimedOut] = useState(false);
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
