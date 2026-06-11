import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, GeneralAttendanceDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceState = 'P' | 'A' | 'L' | 'S' | 'E';
type Session = 'AM' | 'PM';

interface DayRow {
  date: string;
  am: AttendanceState | null;
  amReason?: string;
  pm: AttendanceState | null;
  pmReason?: string;
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
  const { activeTerm, loading: calLoading } = useInstitutionAcademicCalendar();
  const [rows, setRows] = useState<DayRow[]>([]);
  const [loading, setLoading] = useState(false);

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

        const result: DayRow[] = dates.map((date) => {
          const amDoc = byDateSession.get(`${date}_AM`);
          const pmDoc = byDateSession.get(`${date}_PM`);
          return {
            date,
            am: (amDoc?.records[user.uid]?.state as AttendanceState) ?? null,
            amReason: amDoc?.records[user.uid]?.reason,
            pm: (pmDoc?.records[user.uid]?.state as AttendanceState) ?? null,
            pmReason: pmDoc?.records[user.uid]?.reason,
          };
        });
        setRows(result);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, classId, institutionId, activeTerm]);

  if (USE_MOCK) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-500 dark:text-gray-400">Attendance is not available in demo mode.</p>
      </div>
    );
  }

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

  const presentCount = rows.filter((r) => r.am === 'P' || r.pm === 'P').length;
  const absentCount  = rows.filter((r) => r.am === 'A' || r.pm === 'A').length;
  const totalFilled  = rows.reduce((acc, r) => acc + (r.am ? 1 : 0) + (r.pm ? 1 : 0), 0);
  const presentSessions = rows.reduce(
    (acc, r) => acc + (r.am === 'P' ? 1 : 0) + (r.pm === 'P' ? 1 : 0),
    0
  );
  const rate = totalFilled > 0 ? Math.round((presentSessions / totalFilled) * 100) : null;

  return (
    <div className="p-4 sm:p-6 max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">My Attendance</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
          {activeTerm.name} · {activeTerm.startDate} – {activeTerm.endDate}
        </p>
      </div>

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
    </div>
  );
}
