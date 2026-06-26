import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import Table from '@/components/Table';
import Pagination from '@/components/Pagination';
import { PAGE_SIZE } from '@/lib/utils';
import {
  type Assignment,
  type FeedbackLite,
  type MarkBookRow,
  type MarkBookStatus,
  type ResultLite,
  type SlotLite,
  type SubjectLite,
  type TrackingResult,
  buildAssignments,
  computeTracking,
} from '@/lib/gradeEntryTracking';

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
  const { institutionId } = useAuth();

  const [terms, setTerms] = useState<{ id: string; name: string }[]>([]);
  const [termId, setTermId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [results, setResults] = useState<ResultLite[]>([]);
  const [feedback, setFeedback] = useState<FeedbackLite[]>([]);
  const [rosters, setRosters] = useState<Map<string, number>>(new Map());

  const [teacherFilter, setTeacherFilter] = useState('');
  const [behindOnly, setBehindOnly] = useState(false);
  const [page, setPage] = useState(1);

  // Load terms once per institution.
  useEffect(() => {
    if (!institutionId || institutionId === '*') return;
    getDocs(query(collection(db, 'terms'), where('institutionId', '==', institutionId))).then((snap) =>
      setTerms(snap.docs.map((d) => ({ id: d.id, name: (d.data().name as string) ?? d.id }))),
    );
  }, [institutionId]);

  // Load all inputs for the selected term.
  useEffect(() => {
    if (!institutionId || institutionId === '*' || !termId) {
      setAssignments([]);
      setResults([]);
      setFeedback([]);
      setRosters(new Map());
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPage(1);

    const instScope = where('institutionId', '==', institutionId);
    const termScope = where('termId', '==', termId);

    Promise.all([
      getDocs(query(collection(db, 'timetable_slots'), instScope, termScope)),
      getDocs(query(collection(db, 'subjects'), instScope)),
      getDocs(query(collection(db, 'results'), instScope, termScope)),
      getDocs(query(collection(db, 'feedback_comments'), instScope, termScope)),
      getDocs(query(collection(db, 'users'), instScope, where('role', '==', 'student'))),
    ])
      .then(([slotSnap, subjSnap, resSnap, fbSnap, stuSnap]) => {
        if (cancelled) return;

        const slots: SlotLite[] = slotSnap.docs.map((d) => {
          const x = d.data();
          return {
            teacherId: x.teacherId as string,
            teacherName: (x.teacherName as string) ?? (x.teacherId as string),
            subjectId: x.subjectId as string,
            subjectName: (x.subjectName as string) ?? (x.subjectId as string),
            classId: x.classId as string,
            className: (x.className as string) ?? (x.classId as string),
          };
        });

        const subjects: SubjectLite[] = subjSnap.docs.map((d) => {
          const x = d.data();
          return {
            subjectId: d.id,
            subjectName: (x.name as string) ?? d.id,
            teacherIds: (x.teacherIds as string[]) ?? [],
            teacherNames: (x.teacherNames as string[]) ?? [],
            classIds: (x.classIds as string[]) ?? [],
            classNames: (x.classNames as string[]) ?? [],
          };
        });

        setAssignments(buildAssignments(slots, subjects));

        setResults(
          resSnap.docs.map((d) => {
            const x = d.data();
            return {
              subjectId: x.subjectId as string,
              classId: x.classId as string,
              studentId: x.studentId as string,
              assessmentName: (x.assessmentName as string) ?? '',
            };
          }),
        );

        setFeedback(
          fbSnap.docs.map((d) => {
            const x = d.data();
            return {
              subjectId: x.subjectId as string,
              classId: x.classId as string,
              studentId: x.studentId as string,
            };
          }),
        );

        const roster = new Map<string, number>();
        stuSnap.docs.forEach((d) => {
          const classId = d.data().classId as string | undefined;
          if (classId) roster.set(classId, (roster.get(classId) ?? 0) + 1);
        });
        setRosters(roster);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load grade-entry data. Check your connection and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [institutionId, termId]);

  const tracking: TrackingResult = useMemo(
    () => computeTracking(assignments, results, rosters, feedback),
    [assignments, results, rosters, feedback],
  );

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
        {termId && (
          <span className="text-xs text-gray-400 pb-2">
            {loading ? 'Loading…' : `${tracking.markBooks.length} mark book(s)`}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {termId && !loading && !error && tracking.markBooks.length === 0 && (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No mark books found for this term. This view needs teacher–subject–class assignments (from the schedule or
          subject setup) before it can track grade entry.
        </p>
      )}

      {termId && !loading && tracking.markBooks.length > 0 && (
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
