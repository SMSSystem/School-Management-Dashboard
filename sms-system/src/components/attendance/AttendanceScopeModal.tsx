import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { PDFDownloadLink } from '@react-pdf/renderer';
import { db, ClassDocument, GeneralAttendanceDocument } from '@/lib/firebase';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { AttendancePDF, AttendancePDFData } from '@/components/attendance/AttendancePDF';

type Session = 'AM' | 'PM';
type AttendanceState = 'P' | 'A' | 'L' | 'S' | 'E';

interface Props {
  open: boolean;
  onClose: () => void;
  /** Pre-select a class when opened from the register page. */
  defaultClassId?: string;
}

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function formatRangeLabel(start: string, end: string): string {
  const fmt = (iso: string) =>
    new Date(iso + 'T12:00:00Z').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function AttendanceScopeModal({ open, onClose, defaultClassId }: Props) {
  const { institutionId } = useAuth();
  const { activeTerm, activeYear, loading: calLoading } = useInstitutionAcademicCalendar();

  const [classes, setClasses] = useState<(ClassDocument & { id: string })[]>([]);
  const [selectedClassId, setSelectedClassId] = useState(defaultClassId ?? '');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [sessions, setSessions] = useState<Session[]>(['AM', 'PM']);
  const [generating, setGenerating] = useState(false);
  const [pdfData, setPdfData] = useState<AttendancePDFData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setSelectedClassId(defaultClassId ?? '');
    setStartDate(activeTerm?.startDate ?? '');
    setEndDate(toISO(new Date()));
    setSessions(['AM', 'PM']);
    setPdfData(null);
    setError(null);
  }, [open, defaultClassId, activeTerm]);

  // Load classes
  useEffect(() => {
    if (!institutionId || USE_MOCK) return;
    getDocs(query(collection(db, 'classes'), where('institutionId', '==', institutionId)))
      .then((snap) => setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassDocument & { id: string }))));
  }, [institutionId]);

  function toggleSession(s: Session) {
    setSessions((prev) =>
      prev.includes(s)
        ? prev.filter((x) => x !== s)
        : [...prev, s].sort() as Session[]
    );
  }

  async function generate() {
    const cls = classes.find((c) => c.id === selectedClassId);
    if (!cls || !institutionId || !startDate || !endDate || sessions.length === 0) return;

    setGenerating(true);
    setError(null);
    setPdfData(null);

    try {
      // Fetch students
      const studentSnap = await getDocs(
        query(
          collection(db, 'users'),
          where('institutionId', '==', institutionId),
          where('role', '==', 'student'),
          where('classId', '==', selectedClassId),
        )
      );
      const students = studentSnap.docs
        .map((d) => ({ uid: d.id, name: (d.data().name as string) ?? d.id }))
        .sort((a, b) => {
          const sA = a.name.split(' ').pop()?.toLowerCase() ?? '';
          const sB = b.name.split(' ').pop()?.toLowerCase() ?? '';
          return sA.localeCompare(sB);
        });

      // Fetch attendance docs in range
      const attSnap = await getDocs(
        query(
          collection(db, 'generalAttendance'),
          where('institutionId', '==', institutionId),
          where('classId', '==', selectedClassId),
          where('date', '>=', startDate),
          where('date', '<=', endDate),
        )
      );

      const dateSet = new Set<string>();
      const recordMap: Record<string, Record<string, AttendanceState | null>> = {};

      attSnap.docs.forEach((d) => {
        const data = d.data() as GeneralAttendanceDocument;
        if (!sessions.includes(data.session)) return;
        dateSet.add(data.date);
        const key = `${data.date}_${data.session}`;
        recordMap[key] = {};
        for (const [sid, rec] of Object.entries(data.records)) {
          recordMap[key][sid] = rec.state as AttendanceState;
        }
      });

      const dates = Array.from(dateSet).sort();

      const data: AttendancePDFData = {
        institutionName: cls.name ? `${cls.name} — Attendance` : 'Attendance',
        className: cls.name,
        termName: activeTerm?.name ?? 'Term',
        dateRangeLabel: formatRangeLabel(startDate, endDate),
        sessions,
        students,
        dates,
        records: recordMap,
      };

      setPdfData(data);
    } catch {
      setError('Failed to fetch attendance data. Check your connection and try again.');
    } finally {
      setGenerating(false);
    }
  }

  if (!open) return null;

  const termStart = activeTerm?.startDate ?? '';
  const termEnd   = activeTerm?.endDate   ?? '';
  const today     = toISO(new Date());
  const maxEnd    = termEnd < today ? termEnd : today;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 max-w-md w-full mx-4 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Export Attendance Register</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {USE_MOCK ? (
          <p className="text-sm text-gray-500 dark:text-gray-400">PDF export is not available in demo mode.</p>
        ) : calLoading ? (
          <div className="h-8 w-32 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        ) : (
          <div className="space-y-4">
            {/* Class */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Class</label>
              <select
                value={selectedClassId}
                onChange={(e) => { setSelectedClassId(e.target.value); setPdfData(null); }}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
              >
                <option value="">Select a class…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Date range */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">From</label>
                <input
                  type="date"
                  value={startDate}
                  min={termStart}
                  max={endDate || maxEnd}
                  onChange={(e) => { setStartDate(e.target.value); setPdfData(null); }}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">To</label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate || termStart}
                  max={maxEnd}
                  onChange={(e) => { setEndDate(e.target.value); setPdfData(null); }}
                  className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {/* Sessions */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Sessions</label>
              <div className="flex gap-4">
                {(['AM', 'PM'] as Session[]).map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sessions.includes(s)}
                      onChange={() => { toggleSession(s); setPdfData(null); }}
                      className="rounded border-gray-300"
                    />
                    {s}
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-3 justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>

              {!pdfData ? (
                <button
                  type="button"
                  onClick={generate}
                  disabled={generating || !selectedClassId || !startDate || !endDate || sessions.length === 0}
                  className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600 disabled:bg-sky-300 dark:disabled:bg-sky-800"
                >
                  {generating ? 'Generating…' : 'Generate'}
                </button>
              ) : (
                <PDFDownloadLink
                  document={<AttendancePDF data={pdfData} />}
                  fileName={`attendance-${pdfData.className.replace(/\s+/g, '-').toLowerCase()}-${startDate}.pdf`}
                  className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 no-underline"
                >
                  {({ loading }) => loading ? 'Preparing…' : 'Download PDF'}
                </PDFDownloadLink>
              )}
            </div>

            {pdfData && (
              <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
                {pdfData.students.length} student{pdfData.students.length !== 1 ? 's' : ''} ·{' '}
                {pdfData.dates.length} day{pdfData.dates.length !== 1 ? 's' : ''} ·{' '}
                {pdfData.sessions.join(' + ')}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
