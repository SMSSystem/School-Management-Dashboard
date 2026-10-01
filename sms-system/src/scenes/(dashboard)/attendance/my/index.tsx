import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { getDocs, query, where } from 'firebase/firestore';
import { GeneralAttendanceDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { institutionCollection } from '@/lib/paths';
import { useAttendanceTerm } from '@/hooks/useAttendanceTerm';
import { computeAttendanceTotals, computeDayRowTotals } from '@/lib/attendanceTotals';
import { ATTENDANCE_STATES, ATTENDANCE_STATE_LABELS, ATTENDANCE_CHIP_COLORS, type AttendanceState } from '@/lib/attendanceStates';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayRow {
  date: string;
  am: AttendanceState | null;
  amReason?: string;
  pm: AttendanceState | null;
  pmReason?: string;
}

interface SubjectSessionRow {
  date: string;
  state: AttendanceState;
  reason?: string;
}

interface SubjectItem {
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  sessions: SubjectSessionRow[];
}

interface EnrollmentData {
  subjectId: string;
  subjectName: string;
  classId: string;
  className: string;
  enrollmentType: 'all' | 'selective';
  excludedStudentIds: string[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

const STATE_COLORS = ATTENDANCE_CHIP_COLORS;
const STATE_LABELS = ATTENDANCE_STATE_LABELS;

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40" role="status" aria-label="Loading">
      <div className="h-8 w-8 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
    </div>
  );
}

function Message({ children, tone = 'muted' }: { children: React.ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div className="p-4 sm:p-6">
      <p className={`text-sm ${tone === 'error' ? 'text-red-500 dark:text-red-400' : 'text-gray-500 dark:text-gray-400'}`}>
        {children}
      </p>
    </div>
  );
}

function StateChip({ state }: { state: AttendanceState | null }) {
  if (!state) return <span className="text-xs text-gray-400 dark:text-gray-600">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium ${STATE_COLORS[state]}`}>
      <span className="font-bold">{state}</span>
      <span>{STATE_LABELS[state]}</span>
    </span>
  );
}

function SessionCell({ label, state, reason }: { label: string; state: AttendanceState | null; reason?: string }) {
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 dark:text-gray-500">{label}</span>
      <StateChip state={state} />
      {state === 'E' && reason && <span className="text-xs text-gray-500 dark:text-gray-400 italic wrap-break-word">{reason}</span>}
    </div>
  );
}

function StatTile({ value, label, tone }: { value: React.ReactNode; label: string; tone: 'neutral' | 'green' | 'red' }) {
  const tones = {
    neutral: 'bg-gray-50 border-gray-200 dark:bg-gray-800 dark:border-gray-700 text-gray-900 dark:text-gray-100',
    green: 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700 text-green-700 dark:text-green-400',
    red: 'bg-red-50 border-red-200 dark:bg-red-900/20 dark:border-red-700 text-red-700 dark:text-red-400',
  } as const;
  return (
    <div className={`rounded-xl border px-2 py-3 text-center ${tones[tone]}`}>
      <div className="text-xl font-bold leading-none">{value}</div>
      <div className="mt-1 text-[11px] sm:text-xs opacity-80 leading-tight">{label}</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyAttendancePage() {
  const { user, classId, institutionId } = useAuth();
  // Works in both calendar modes: a custom-calendar institution has no single
  // activeTerm, so the term comes from the student's class's own time block.
  const {
    term: activeTerm,
    blocks,
    needsPicker,
    selectedTermId,
    setSelectedTermId,
    loading: calLoading,
    timedOut: calTimedOut,
  } = useAttendanceTerm(classId);

  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'subject'>('general');
  const [subjectItems, setSubjectItems] = useState<SubjectItem[]>([]);
  const [subjectLoading, setSubjectLoading] = useState(false);
  const [openSubjects, setOpenSubjects] = useState<Set<string>>(new Set());

  // ── General attendance fetch ──
  useEffect(() => {
    if (USE_MOCK || !user || !classId || !institutionId || !activeTerm) return;
    setLoading(true);
    getDocs(
      query(
        institutionCollection(institutionId, 'generalAttendance'),
        where('classId', '==', classId),
        where('date', '>=', activeTerm.startDate),
        where('date', '<=', activeTerm.endDate),
      )
    )
      .then((snap) => {
        const byDateSession = new Map<string, GeneralAttendanceDocument>();
        snap.docs.forEach((d) => {
          const data = d.data() as GeneralAttendanceDocument;
          byDateSession.set(`${data.date}_${data.session}`, data);
        });
        const dates = Array.from(
          new Set(snap.docs.map((d) => (d.data() as GeneralAttendanceDocument).date))
        ).sort();
        setRows(
          dates.map((date) => {
            const amDoc = byDateSession.get(`${date}_AM`);
            const pmDoc = byDateSession.get(`${date}_PM`);
            return {
              date,
              am: (amDoc?.records[user.uid]?.state as AttendanceState) ?? null,
              amReason: amDoc?.records[user.uid]?.reason,
              pm: (pmDoc?.records[user.uid]?.state as AttendanceState) ?? null,
              pmReason: pmDoc?.records[user.uid]?.reason,
            };
          })
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, classId, institutionId, activeTerm]);

  // ── Subject attendance fetch ──
  useEffect(() => {
    if (USE_MOCK || !user || !classId || !institutionId || !activeTerm) return;
    const today = new Date().toISOString().slice(0, 10);
    setSubjectLoading(true);

    getDocs(institutionCollection(institutionId, 'subjectEnrollments'))
      .then(async (enrollSnap) => {
        const eligible = enrollSnap.docs
          .map((d) => d.data() as EnrollmentData)
          .filter(
            (e) =>
              e.classId === classId &&
              (e.enrollmentType === 'all' ||
                (e.enrollmentType === 'selective' && !e.excludedStudentIds.includes(user.uid))),
          );

        if (eligible.length === 0) {
          setSubjectItems([]);
          return;
        }

        const results = await Promise.all(
          eligible.map(async (enrollment) => {
            const attSnap = await getDocs(
              query(
                institutionCollection(institutionId, 'subjectAttendance'),
                where('subjectId', '==', enrollment.subjectId),
                where('classId', '==', enrollment.classId),
                where('sessionDate', '>=', activeTerm.startDate),
                where('sessionDate', '<=', today),
              ),
            );
            const sessions: SubjectSessionRow[] = attSnap.docs
              .flatMap((d) => {
                const data = d.data();
                const record = (
                  data.records as Record<string, { state: AttendanceState; reason?: string }>
                )?.[user.uid];
                if (!record) return [] as SubjectSessionRow[];
                return [{ date: data.sessionDate as string, state: record.state, reason: record.reason }];
              })
              .sort((a, b) => a.date.localeCompare(b.date));
            return {
              subjectId: enrollment.subjectId,
              subjectName: enrollment.subjectName,
              classId: enrollment.classId,
              className: enrollment.className,
              sessions,
            };
          }),
        );

        setSubjectItems(results.sort((a, b) => a.subjectName.localeCompare(b.subjectName)));
      })
      .catch(() => {})
      .finally(() => setSubjectLoading(false));
  }, [user, classId, institutionId, activeTerm]);

  function toggleSubject(id: string) {
    setOpenSubjects((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── Early gates ──

  if (USE_MOCK) return <Message>Attendance is not available in demo mode.</Message>;
  if (calTimedOut) return <Message tone="error">Something went wrong. Please contact your administrator.</Message>;
  if (calLoading || loading) return <Spinner />;
  if (!activeTerm) return <Message>There is no active term right now, so there is no attendance to show yet.</Message>;
  if (!classId) return <Message>You are not assigned to a class yet. Contact your teacher.</Message>;

  // ── General tab stats ──
  const { presentSessions, rate } = computeDayRowTotals(rows);
  const absentSessions = rows.reduce((acc, r) => acc + (r.am === 'A' ? 1 : 0) + (r.pm === 'A' ? 1 : 0), 0);

  // ── Subject accordion render ──
  function SubjectAccordion() {
    if (subjectLoading) return <Spinner />;
    if (subjectItems.length === 0) {
      return <p className="text-sm text-gray-500 dark:text-gray-400">No subject attendance records found for this term.</p>;
    }
    return (
      <div className="flex flex-col gap-3">
        {subjectItems.map((item) => {
          const isOpen = openSubjects.has(item.subjectId);
          const totals = computeAttendanceTotals(item.sessions, item.sessions.length);
          return (
            <div key={item.subjectId} className="rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-gray-900">
              <button
                type="button"
                onClick={() => toggleSubject(item.subjectId)}
                aria-expanded={isOpen}
                className="w-full min-h-14 flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{item.subjectName}</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    Present {totals.P} of {totals.effectiveExpectedSessions}
                  </div>
                </div>
                <ChevronDown className={`w-5 h-5 shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className="border-t border-gray-100 dark:border-gray-800 p-4">
                  {item.sessions.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No sessions recorded yet.</p>
                  ) : (
                    <>
                      <ul className="divide-y divide-gray-100 dark:divide-gray-800">
                        {item.sessions.map((s) => (
                          <li key={s.date} className="flex items-start justify-between gap-3 py-2.5">
                            <span className="text-sm text-gray-700 dark:text-gray-300">{formatDateLabel(s.date)}</span>
                            <div className="flex flex-col items-end gap-1 min-w-0">
                              <StateChip state={s.state} />
                              {s.reason && <span className="text-xs text-gray-500 dark:text-gray-400 italic text-right wrap-break-word">{s.reason}</span>}
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <span className="inline-flex items-center rounded-full bg-gray-100 dark:bg-gray-800 px-3 py-1.5 text-xs font-bold text-gray-900 dark:text-gray-100">
                          {Math.round(totals.attendanceRate)}% rate
                        </span>
                        {ATTENDANCE_STATES.filter((s) => totals[s] > 0).map((s) => (
                          <span key={s} className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${STATE_COLORS[s]}`}>
                            {STATE_LABELS[s]}: {totals[s]}
                          </span>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="p-3 sm:p-6 max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Attendance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {activeTerm.name} · {activeTerm.startDate} – {activeTerm.endDate}
        </p>
      </div>

      {/* Only shown when the class's own time block isn't among the active ones */}
      {needsPicker && (
        <label className="mb-4 flex flex-col gap-1 text-sm text-gray-600 dark:text-gray-300">
          Time block
          <select
            value={selectedTermId ?? ''}
            onChange={(e) => setSelectedTermId(e.target.value)}
            className="min-h-11 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-3 text-base"
          >
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {/* Segmented tabs */}
      <div role="tablist" className="grid grid-cols-2 gap-1 rounded-xl bg-gray-100 dark:bg-gray-800 p-1 mb-4">
        {(['general', 'subject'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            className={`min-h-11 rounded-lg px-2 text-sm font-medium transition-colors ${
              activeTab === tab
                ? 'bg-white dark:bg-gray-700 text-sky-600 dark:text-sky-300 shadow-sm'
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab === 'general' ? 'General' : 'By subject'}
          </button>
        ))}
      </div>

      {activeTab === 'subject' ? (
        <SubjectAccordion />
      ) : (
        <>
          {/* Summary tiles */}
          {rows.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mb-4">
              <StatTile tone="neutral" value={rate !== null ? `${rate}%` : '—'} label="Attendance rate" />
              <StatTile tone="green" value={presentSessions} label="Present sessions" />
              <StatTile tone="red" value={absentSessions} label="Absent sessions" />
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No attendance records for this term yet.</p>
          ) : (
            <>
              {/* Phones: one card per day, AM and PM side by side */}
              <ul className="flex flex-col gap-2 md:hidden">
                {rows.map((row) => (
                  <li key={row.date} className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 p-3">
                    <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{formatDateLabel(row.date)}</div>
                    <div className="grid grid-cols-2 gap-3">
                      <SessionCell label="AM" state={row.am} reason={row.amReason} />
                      <SessionCell label="PM" state={row.pm} reason={row.pmReason} />
                    </div>
                  </li>
                ))}
              </ul>

              {/* Tablet/desktop: table */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-200">Date</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-200">AM</th>
                      <th className="px-4 py-2 text-left font-medium text-gray-700 dark:text-gray-200">PM</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {rows.map((row) => (
                      <tr key={row.date} className="bg-white dark:bg-gray-900">
                        <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">{formatDateLabel(row.date)}</td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-0.5">
                            <StateChip state={row.am} />
                            {row.am === 'E' && row.amReason && <span className="text-xs text-gray-500 dark:text-gray-400 italic">{row.amReason}</span>}
                          </div>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex flex-col gap-0.5">
                            <StateChip state={row.pm} />
                            {row.pm === 'E' && row.pmReason && <span className="text-xs text-gray-500 dark:text-gray-400 italic">{row.pmReason}</span>}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
