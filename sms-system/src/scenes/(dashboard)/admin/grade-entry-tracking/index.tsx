import { useEffect, useMemo, useRef, useState } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db, type GradeTrackingFrequency } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { institutionDoc } from '@/lib/paths';
import Table from '@/components/Table';
import Pagination from '@/components/Pagination';
import { PAGE_SIZE } from '@/lib/utils';
import {
  type Assignment,
  type FeedbackLite,
  type MarkBookRow,
  type MarkBookStatus,
  type ResultLite,
  type TrackingResult,
  computeTracking,
} from '@/lib/gradeEntryTracking';
import { type TrackingData, TRACKING_STALE_MS, cachedTrackingData } from '@/lib/gradeTrackingCache';
import { fetchTrackingData } from '@/lib/gradeTrackingLoader';
import { generateGradeTrackingPeriods, type GradeTrackingPeriod } from '@/lib/gradeTrackingPeriods';
import { useCurrentTerm } from '@/lib/CurrentTermContext';
import { useInstitutionTerms, type InstitutionTerm } from '@/hooks/useInstitutionTerms';
import { queryClient } from '@/lib/queryClient';
import { canManage } from '@/lib/roleCapabilities';

// ── styling tokens (match report-cards / report-builder scenes) ─────────────────
const SELECT_CLS =
  'border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 dark:text-gray-200';
const LABEL_CLS = 'text-xs font-medium text-gray-500 dark:text-gray-400';

const STATUS_META: Record<MarkBookStatus, { label: string; cls: string }> = {
  complete: { label: 'Complete', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' },
  in_progress: { label: 'In progress', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300' },
  behind: { label: 'Behind', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' },
  not_started: { label: 'Not started', cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' },
};

const pct = (n: number) => `${Math.round(n * 100)}%`;

// Stable empty values for before anything is loaded (so the memo below does not recompute).
const NO_ASSIGNMENTS: Assignment[] = [];
const NO_RESULTS: ResultLite[] = [];
const NO_FEEDBACK: FeedbackLite[] = [];
const NO_ROSTERS = new Map<string, number>();

const markBookColumns = [
  { header: 'Teacher', accessor: 'teacherName' },
  { header: 'Subject', accessor: 'subjectName', className: 'hidden sm:table-cell' },
  { header: 'Class', accessor: 'className', className: 'hidden sm:table-cell' },
  { header: 'Columns', accessor: 'columns', className: 'text-right' },
  { header: 'Filled', accessor: 'filled', className: 'text-right hidden md:table-cell' },
  { header: '% Complete', accessor: 'completeness', className: 'text-right' },
  { header: 'Feedback', accessor: 'feedback', className: 'text-right hidden md:table-cell' },
  { header: 'Status', accessor: 'status' },
];

const GradeEntryTrackingPage = () => {
  const { institutionId, role } = useAuth();
  // Renaming a period saves to the term, so a spectator (read-only) never sees it.
  const mayEdit = canManage(role);

  const { data: terms = [] } = useInstitutionTerms();
  // App-wide "current term" (DEV_NOTES Item 6.2) — synced with Gradebook,
  // Schedule, Attendance Gridsheet, and Report Card Comments.
  const { currentTermId: termId, setCurrentTermId: setTermId } = useCurrentTerm();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Loaded on request (a term's results and feedback are thousands of reads), then cached.
  const [data, setData] = useState<TrackingData | null>(null);
  const assignments = data?.assignments ?? NO_ASSIGNMENTS;
  const results = data?.results ?? NO_RESULTS;
  const feedback = data?.feedback ?? NO_FEEDBACK;
  const rosters = data?.rosters ?? NO_ROSTERS;
  const wantedTerm = useRef('');

  const [teacherFilter, setTeacherFilter] = useState('');
  const [behindOnly, setBehindOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [gradeTrackingFrequency, setGradeTrackingFrequency] = useState<GradeTrackingFrequency | null>(null);
  const [periodKey, setPeriodKey] = useState('');
  const [isEditingLabel, setIsEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState('');
  const [savingLabel, setSavingLabel] = useState(false);

  // Load the institution's grade-tracking frequency (bi-monthly/monthly), if configured.
  useEffect(() => {
    if (!institutionId || institutionId === '*') return;
    getDoc(doc(db, 'institutions', institutionId)).then((snap) => {
      setGradeTrackingFrequency(snap.exists() ? (snap.data().gradeTrackingFrequency ?? null) : null);
    });
  }, [institutionId]);

  // Selecting a different term invalidates any previously selected period.
  useEffect(() => {
    setPeriodKey('');
    setIsEditingLabel(false);
  }, [termId]);

  // Changing the term shows already-cached data for it (free) and otherwise waits for "Load tracking".
  useEffect(() => {
    wantedTerm.current = `${institutionId ?? ''}|${termId ?? ''}`;
    setError(null);
    setLoading(false);
    setPage(1);
    setData(institutionId && institutionId !== '*' && termId ? (cachedTrackingData(institutionId, termId) ?? null) : null);
  }, [institutionId, termId]);

  const loadTracking = async (force: boolean) => {
    if (!institutionId || institutionId === '*' || !termId) return;
    const forKey = `${institutionId}|${termId}`;
    setLoading(true);
    setError(null);
    try {
      const loaded = await fetchTrackingData(institutionId, termId, force);
      if (wantedTerm.current === forKey) setData(loaded);
    } catch {
      if (wantedTerm.current === forKey) setError('Failed to load grade-entry data. Check your connection and try again.');
    } finally {
      if (wantedTerm.current === forKey) setLoading(false);
    }
  };

  const selectedTerm = useMemo(() => terms.find((t) => t.id === termId), [terms, termId]);

  const periods: GradeTrackingPeriod[] = useMemo(() => {
    if (!selectedTerm || !gradeTrackingFrequency) return [];
    return generateGradeTrackingPeriods(selectedTerm, gradeTrackingFrequency);
  }, [selectedTerm, gradeTrackingFrequency]);

  const selectedPeriod = useMemo(() => periods.find((p) => p.key === periodKey), [periods, periodKey]);

  const tracking: TrackingResult = useMemo(
    () =>
      computeTracking(assignments, results, rosters, feedback, {
        periodRange: selectedPeriod ? { startDate: selectedPeriod.startDate, endDate: selectedPeriod.endDate } : undefined,
      }),
    [assignments, results, rosters, feedback, selectedPeriod],
  );

  const startEditingLabel = () => {
    if (!selectedPeriod) return;
    setLabelDraft(selectedPeriod.label);
    setIsEditingLabel(true);
  };

  const cancelEditingLabel = () => {
    setIsEditingLabel(false);
    setLabelDraft('');
  };

  const saveLabel = async () => {
    if (!institutionId || !termId || !selectedPeriod || !labelDraft.trim()) return;
    setSavingLabel(true);
    try {
      const trimmed = labelDraft.trim();
      await updateDoc(institutionDoc(institutionId, 'terms', termId), {
        [`periodLabelOverrides.${selectedPeriod.key}`]: trimmed,
      });
      // Optimistic update of the shared terms cache (not a local setTerms —
      // terms now comes from useInstitutionTerms(), a query every other
      // consumer shares too; see FIRESTORE_READ_CACHING_SPEC.md §5's
      // invalidation convention for mutations outside FormModal).
      queryClient.setQueryData(['terms', institutionId], (prev?: InstitutionTerm[]) =>
        prev?.map((t) =>
          t.id === termId
            ? { ...t, periodLabelOverrides: { ...t.periodLabelOverrides, [selectedPeriod.key]: trimmed } }
            : t,
        ),
      );
      setIsEditingLabel(false);
    } finally {
      setSavingLabel(false);
      setLabelDraft('');
    }
  };

  const teacherOptions = useMemo(
    () => tracking.teachers.map((t) => ({ id: t.teacherId, name: t.teacherName })),
    [tracking.teachers],
  );

  const filteredMarkBooks = useMemo(() => {
    let rows = [...tracking.markBooks];
    if (teacherFilter) rows = rows.filter((r) => r.teacherId === teacherFilter);
    if (behindOnly) rows = rows.filter((r) => r.status === 'behind' || r.status === 'not_started');
    return rows.sort((a, b) => a.completeness - b.completeness);
  }, [tracking.markBooks, teacherFilter, behindOnly]);

  const paginated = filteredMarkBooks.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasApproximate = tracking.markBooks.some((m) => m.approximate);

  if (!institutionId || institutionId === '*') {
    return (
      <div className="p-4 sm:p-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Grade-Entry Tracking</h1>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Grade-entry tracking is scoped to a single institution. Sign in as an institution admin to view it.
        </p>
      </div>
    );
  }

  const renderRow = (item: MarkBookRow) => (
    <tr
      key={`${item.teacherId}_${item.subjectId}_${item.classId}`}
      className="border-b border-gray-200 dark:border-gray-700 even:bg-slate-50 dark:even:bg-gray-800/60 text-sm"
    >
      <td className="p-3">
        {item.teacherName}
        {item.approximate && (
          <span className="ml-1 text-amber-500" title="Approximate assignment — no timetable slot for this subject">
            ~
          </span>
        )}
      </td>
      <td className="p-3 hidden sm:table-cell">{item.subjectName}</td>
      <td className="p-3 hidden sm:table-cell">{item.className}</td>
      <td className="p-3 text-right tabular-nums">{item.columns}</td>
      <td className="p-3 text-right tabular-nums hidden md:table-cell">
        {item.filledCells}/{item.totalCells}
      </td>
      <td className="p-3 text-right tabular-nums">{item.columns === 0 ? '—' : pct(item.completeness)}</td>
      <td className="p-3 text-right tabular-nums hidden md:table-cell">
        {item.expectedStudents === 0 ? '—' : pct(item.feedbackComplete)}
      </td>
      <td className="p-3">
        <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${STATUS_META[item.status].cls}`}>
          {STATUS_META[item.status].label}
        </span>
      </td>
    </tr>
  );

  return (
    <div className="p-4 sm:p-6 flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Grade-Entry Tracking</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Per-term completeness of teachers' mark books — columns created, marks entered, and who is behind.
        </p>
      </div>

      {/* Term selector */}
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex flex-col gap-1">
          <span className={LABEL_CLS}>Term</span>
          <select value={termId} onChange={(e) => setTermId(e.target.value)} className={SELECT_CLS}>
            <option value="">Select term…</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        {termId && periods.length > 0 && (
          <label className="flex flex-col gap-1">
            <span className={LABEL_CLS}>Period</span>
            <select value={periodKey} onChange={(e) => { setPeriodKey(e.target.value); setIsEditingLabel(false); }} className={SELECT_CLS}>
              <option value="">All periods (whole term)</option>
              {periods.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {mayEdit && selectedPeriod && !isEditingLabel && (
          <button
            type="button"
            onClick={startEditingLabel}
            className="text-xs text-sky-600 dark:text-sky-400 hover:underline pb-2"
          >
            Rename "{selectedPeriod.label}"
          </button>
        )}
        {mayEdit && selectedPeriod && isEditingLabel && (
          <div className="flex items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLS}>Period label</span>
              <input
                type="text"
                autoComplete="off"
                value={labelDraft}
                onChange={(e) => setLabelDraft(e.target.value)}
                maxLength={40}
                className={`${SELECT_CLS} w-40`}
              />
            </label>
            <button
              type="button"
              disabled={savingLabel || !labelDraft.trim()}
              onClick={saveLabel}
              className="px-3 py-2 text-xs rounded-md bg-sky-500 text-white hover:bg-sky-600 disabled:opacity-50 cursor-pointer"
            >
              {savingLabel ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              disabled={savingLabel}
              onClick={cancelEditingLabel}
              className="px-3 py-2 text-xs rounded-md bg-gray-100 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 disabled:opacity-50 cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
        {termId && (
          <span className="text-xs text-gray-400 pb-2">
            {loading ? 'Loading…' : data ? `${tracking.markBooks.length} mark book(s)` : ''}
          </span>
        )}
        {termId && data && !loading && (
          <button
            type="button"
            onClick={() => void loadTracking(true)}
            className="px-3 py-2 text-xs rounded-md bg-gray-100 dark:bg-gray-700 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer"
          >
            Refresh
          </button>
        )}
      </div>

      {termId && !data && !loading && (
        <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3 flex flex-col items-start gap-2">
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Tracking reads every result and feedback comment recorded for the term, which can be thousands of documents.
            It loads only when you ask, and is kept for {TRACKING_STALE_MS / 60000} minutes so looking again is free.
          </p>
          <button
            type="button"
            onClick={() => void loadTracking(false)}
            className="px-4 py-2 text-sm rounded-md bg-sky-500 text-white hover:bg-sky-600 cursor-pointer"
          >
            Load tracking
          </button>
        </div>
      )}

      {data && !loading && (
        <p className="text-xs text-gray-400">
          Loaded {data.docsRead.toLocaleString()} documents; cached for {TRACKING_STALE_MS / 60000} minutes. Refresh reads them again.
        </p>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {termId && data && !loading && !error && tracking.markBooks.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No mark books found for this term. This view needs teacher–subject–class assignments (from the schedule or
          subject setup) before it can track grade entry.
        </p>
      )}

      {termId && data && !loading && tracking.markBooks.length > 0 && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SummaryCard label="Teachers behind" value={`${tracking.summary.teachersBehind}/${tracking.summary.teacherCount}`} tone="amber" />
            <SummaryCard label="Avg completeness" value={pct(tracking.summary.avgCompleteness)} tone="sky" />
            <SummaryCard label="Mark books" value={String(tracking.summary.markBookCount)} tone="slate" />
            <SummaryCard label="Marks missing" value={tracking.summary.totalMissing.toLocaleString()} tone="red" />
          </div>

          {/* Teachers behind (worst first) */}
          {tracking.teachers.some((t) => t.behind > 0) && (
            <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
              <h2 className="text-sm font-semibold mb-2 text-gray-700 dark:text-gray-200">Teachers behind</h2>
              <div className="flex flex-wrap gap-2">
                {tracking.teachers
                  .filter((t) => t.behind > 0)
                  .map((t) => (
                    <button
                      key={t.teacherId}
                      onClick={() => {
                        setTeacherFilter(t.teacherId);
                        setPage(1);
                      }}
                      className="text-xs rounded-full border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 px-3 py-1 hover:bg-amber-100"
                      title="Filter the table to this teacher"
                    >
                      {t.teacherName} · {pct(t.avgCompleteness)} · {t.behind} behind
                    </button>
                  ))}
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-wrap items-end gap-4">
            <label className="flex flex-col gap-1">
              <span className={LABEL_CLS}>Teacher</span>
              <select
                value={teacherFilter}
                onChange={(e) => {
                  setTeacherFilter(e.target.value);
                  setPage(1);
                }}
                className={SELECT_CLS}
              >
                <option value="">All teachers</option>
                {teacherOptions.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-300 pb-2">
              <input type="checkbox" checked={behindOnly} onChange={(e) => { setBehindOnly(e.target.checked); setPage(1); }} />
              Behind / not started only
            </label>
          </div>

          {/* Mark-book detail table */}
          <div>
            <Table columns={markBookColumns} renderRow={renderRow} data={paginated} />
            <Pagination total={filteredMarkBooks.length} page={page} pageSize={PAGE_SIZE} onPageChange={setPage} />
          </div>

          {hasApproximate && (
            <p className="text-xs text-gray-400">
              <span className="text-amber-500">~</span> Approximate assignment: no timetable slot exists for the subject,
              so the teacher–class pairing is inferred from subject setup and may overstate expected mark books.
            </p>
          )}
        </>
      )}
    </div>
  );
};

function SummaryCard({ label, value, tone }: { label: string; value: string; tone: 'amber' | 'sky' | 'slate' | 'red' }) {
  const toneCls: Record<typeof tone, string> = {
    amber: 'text-amber-600 dark:text-amber-400',
    sky: 'text-sky-600 dark:text-sky-400',
    slate: 'text-slate-700 dark:text-slate-200',
    red: 'text-red-600 dark:text-red-400',
  };
  return (
    <div className="rounded-md border border-gray-200 dark:border-gray-700 p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${toneCls[tone]}`}>{value}</p>
    </div>
  );
}

export default GradeEntryTrackingPage;
