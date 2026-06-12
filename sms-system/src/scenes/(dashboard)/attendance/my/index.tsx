import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, GeneralAttendanceDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { computeAttendanceTotals } from '@/lib/attendanceTotals';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceState = 'P' | 'A' | 'L' | 'S' | 'E';

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

const STATE_COLORS: Record<AttendanceState, string> = {
  P: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  A: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  L: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
  S: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400',
  E: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const STATE_LABELS: Record<AttendanceState, string> = {
  P: 'Present',
  A: 'Absent',
  L: 'Late',
  S: 'Sick',
  E: 'Excused',
};

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="h-8 w-8 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
    </div>
  );
}

function StateChip({ state }: { state: AttendanceState | null }) {
  if (!state) return <span className="text-xs text-gray-400 dark:text-gray-600">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${STATE_COLORS[state]}`}>
      <span className="font-bold">{state}</span>
      <span>{STATE_LABELS[state]}</span>
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MyAttendancePage() {
  const { user, classId, institutionId } = useAuth();
  const { activeTerm, loading: calLoading, timedOut: calTimedOut } = useInstitutionAcademicCalendar();

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
        collection(db, 'generalAttendance'),
        where('institutionId', '==', institutionId),
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

    getDocs(
      query(
        collection(db, 'subjectEnrollments'),
        where('institutionId', '==', institutionId),
      )
    )
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
                collection(db, 'subjectAttendance'),
                where('institutionId', '==', institutionId),
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

  if (USE_MOCK) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">Attendance is not available in demo mode.</p>
      </div>
    );
  }

  if (calTimedOut) return <div className="flex items-center justify-center h-40"><p className="text-sm text-red-500 dark:text-red-400">Something went wrong. Please contact your administrator.</p></div>;
  if (calLoading || loading) return <Spinner />;

  if (!activeTerm) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">No active academic term is configured.</p>
      </div>
    );
  }

  if (!classId) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">You are not assigned to a class yet. Contact your teacher.</p>
      </div>
    );
  }

  // ── General tab stats ──
  const totalFilled = rows.reduce((acc, r) => acc + (r.am ? 1 : 0) + (r.pm ? 1 : 0), 0);
  const presentSessions = rows.reduce(
    (acc, r) => acc + (r.am === 'P' ? 1 : 0) + (r.pm === 'P' ? 1 : 0),
    0
  );
  const rate = totalFilled > 0 ? Math.round((presentSessions / totalFilled) * 100) : null;

  // ── Subject accordion render ──
  function SubjectAccordion() {
    if (subjectLoading) return <Spinner />;
    if (subjectItems.length === 0) {
      return (
        <p className="text-sm text-gray-500 dark:text-gray-400">
          No subject attendance records found for this term.
        </p>
      );
    }
    return (
      <div className="flex flex-col gap-2">
        {subjectItems.map((item) => {
          const isOpen = openSubjects.has(item.subjectId);
          const totals = computeAttendanceTotals(item.sessions, item.sessions.length);
          return (
            <div key={item.subjectId} className="rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => toggleSubject(item.subjectId)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 dark:bg-gray-800 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <div>
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{item.subjectName}</span>
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">{item.className}</span>
                </div>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Present {totals.P} / {item.sessions.length}
                  </span>
                  <span className="text-xs text-gray-400 dark:text-gray-500">{isOpen ? '▲' : '▼'}</span>
                </div>
              </button>
              {isOpen && (
                <div className="p-4">
                  {item.sessions.length === 0 ? (
                    <p className="text-sm text-gray-500 dark:text-gray-400">No sessions recorded yet.</p>
                  ) : (
                    <>
                      <div className="overflow-x-auto rounded border border-gray-200 dark:border-gray-700">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50 dark:bg-gray-800">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200">Date</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200">State</th>
                              <th className="px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200">Reason</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {item.sessions.map((s) => (
                              <tr key={s.date} className="bg-white dark:bg-gray-900">
                                <td className="px-3 py-2 whitespace-nowrap text-gray-700 dark:text-gray-300">
                                  {formatDateLabel(s.date)}
                                </td>
                                <td className="px-3 py-2">
                                  <StateChip state={s.state} />
                                </td>
                                <td className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 italic">
                                  {s.reason ?? '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-3">
                        <div className="rounded-md bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-3 py-1.5 text-center">
                          <div className="text-sm font-bold text-gray-900 dark:text-gray-100">
                            {Math.round(totals.attendanceRate)}%
                          </div>
                          <div className="text-xs text-gray-500 dark:text-gray-400">Rate</div>
                        </div>
                        {(['P', 'A', 'L', 'S', 'E'] as const)
                          .filter((s) => totals[s] > 0)
                          .map((s) => (
                            <span
                              key={s}
                              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${STATE_COLORS[s]}`}
                            >
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
    <div className="p-4 sm:p-6 max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Attendance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {activeTerm.name} · {activeTerm.startDate} – {activeTerm.endDate}
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 dark:border-gray-700 mb-4">
        {(['general', 'subject'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-sky-500 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            {tab === 'general' ? 'General Attendance' : 'Subject Attendance'}
          </button>
        ))}
      </div>

      {activeTab === 'subject' ? (
        <SubjectAccordion />
      ) : (
        <>
          {/* Summary chips */}
          {rows.length > 0 && (
            <div className="flex flex-wrap gap-3 mb-4">
              {rate !== null && (
                <div className="rounded-md bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 px-4 py-2 text-center">
                  <div className="text-lg font-bold text-gray-900 dark:text-gray-100">{rate}%</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Attendance rate</div>
                </div>
              )}
              <div className="rounded-md bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 px-4 py-2 text-center">
                <div className="text-lg font-bold text-green-700 dark:text-green-400">{presentSessions}</div>
                <div className="text-xs text-green-600 dark:text-green-500">Present sessions</div>
              </div>
              <div className="rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 px-4 py-2 text-center">
                <div className="text-lg font-bold text-red-700 dark:text-red-400">
                  {rows.reduce((acc, r) => acc + (r.am === 'A' ? 1 : 0) + (r.pm === 'A' ? 1 : 0), 0)}
                </div>
                <div className="text-xs text-red-600 dark:text-red-500">Absent sessions</div>
              </div>
            </div>
          )}

          {rows.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">No attendance records for this term yet.</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
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
                      <td className="px-4 py-2 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {formatDateLabel(row.date)}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-0.5">
                          <StateChip state={row.am} />
                          {row.am === 'E' && row.amReason && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 italic">{row.amReason}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col gap-0.5">
                          <StateChip state={row.pm} />
                          {row.pm === 'E' && row.pmReason && (
                            <span className="text-xs text-gray-500 dark:text-gray-400 italic">{row.pmReason}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
