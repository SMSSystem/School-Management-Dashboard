import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, ClassDocument, GeneralAttendanceDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { useSeniorTeacherProfile } from '@/hooks/useSeniorTeacherProfile';
import { AttendanceStateButton } from '@/components/attendance/AttendanceStateButton';
import { ExcusedReasonPopover } from '@/components/attendance/ExcusedReasonPopover';
import {
  getDraft,
  setDraftCell,
  clearDraft,
  purgeExpiredDrafts,
  DraftRecord,
} from '@/lib/attendanceDraft';
import { isSessionWindowClosed } from '@/lib/attendanceWindows';
import { isSchoolDay } from '@/lib/attendanceCalendar';
import { AttendanceScopeModal } from '@/components/attendance/AttendanceScopeModal';
import { rebuildSummariesForClass } from '@/lib/attendanceSummaryUtils';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceState = 'P' | 'A' | 'L' | 'S' | 'E';
type Session = 'AM' | 'PM';

interface StudentRow {
  uid: string;
  name: string;
  surname: string; // for sorting
}

type DraftKey = `${string}_${Session}`;
type DraftStore = Record<DraftKey, Record<string, DraftRecord>>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `date`. */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day;
  d.setUTCDate(d.getUTCDate() + diff);
  return d;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function formatDayLabel(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
}

function surname(name: string): string {
  const parts = name.trim().split(' ');
  return parts[parts.length - 1].toLowerCase();
}

// ─── Small components ─────────────────────────────────────────────────────────

function Spinner() {
  return (
    <div className="flex items-center justify-center h-40">
      <div className="h-8 w-8 rounded-full border-4 border-sky-500 border-t-transparent animate-spin" />
    </div>
  );
}

function InfoState({ message }: { message: string }) {
  return (
    <div className="p-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function GeneralAttendanceRegisterPage() {
  const { user, role, institutionId } = useAuth();
  const { activeYear, activeTerm, nonSchoolDays, loading: calLoading, timedOut: calTimedOut } = useInstitutionAcademicCalendar();
  const { assignedClassId, assignedClassName, loading: profileLoading } = useSeniorTeacherProfile();

  // Class selector (admin/super_admin)
  const [classes, setClasses] = useState<(ClassDocument & { id: string })[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const selectedClass = classes.find((c) => c.id === selectedClassId);

  // Week navigation
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart(new Date()));
  const today = toISO(new Date());

  // Students in class
  const [students, setStudents] = useState<StudentRow[]>([]);

  // Saved Firestore documents for current week
  const [savedDocs, setSavedDocs] = useState<(GeneralAttendanceDocument & { id: string })[]>([]);

  // Draft state: keyed by `${dateISO}_${session}`
  const [draft, setDraftState] = useState<DraftStore>({});

  // Save flow
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [savingKey, setSavingKey] = useState<DraftKey | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // PDF export modal
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Excused reason popover: keyed by `${studentId}_${dateISO}_${session}`
  const [excusedPopover, setExcusedPopover] = useState<string | null>(null);

  // Which session the save buttons belong to
  const [activeSession, setActiveSession] = useState<Session>('AM');
  const [activeDate, setActiveDate] = useState<string>(today);

  const weekDates = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)));
  const termStart = activeTerm?.startDate ?? '';
  const termEnd   = activeTerm?.endDate   ?? '';
  const weekEnd   = weekDates[6];

  // ── Load classes for admin/super_admin ──
  useEffect(() => {
    if (!institutionId || role === 'senior_teacher') return;
    getDocs(query(collection(db, 'classes'), where('institutionId', '==', institutionId)))
      .then((snap) => setClasses(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ClassDocument & { id: string }))));
  }, [institutionId, role]);

  // ── Set effective class ID ──
  const effectiveClassId = role === 'senior_teacher' ? (assignedClassId ?? '') : selectedClassId;
  const effectiveClassName =
    role === 'senior_teacher'
      ? (assignedClassName ?? '')
      : (selectedClass?.name ?? '');

  // ── Purge expired drafts on mount ──
  useEffect(() => {
    if (termStart) purgeExpiredDrafts(termStart);
  }, [termStart]);

  // ── Load students for the selected class ──
  useEffect(() => {
    if (!effectiveClassId) { setStudents([]); return; }
    getDocs(
      query(
        collection(db, 'users'),
        where('institutionId', '==', institutionId),
        where('role', '==', 'student'),
        where('classId', '==', effectiveClassId),
      )
    ).then((snap) => {
      const rows: StudentRow[] = snap.docs.map((d) => ({
        uid: d.id,
        name: (d.data().name as string) ?? d.id,
        surname: surname((d.data().name as string) ?? d.id),
      }));
      rows.sort((a, b) => a.surname.localeCompare(b.surname));
      setStudents(rows);
    });
  }, [effectiveClassId, institutionId]);

  // ── Live query for saved documents in the current week ──
  useEffect(() => {
    if (!effectiveClassId || !institutionId) return;
    const unsub = onSnapshot(
      query(
        collection(db, 'generalAttendance'),
        where('institutionId', '==', institutionId),
        where('classId', '==', effectiveClassId),
        where('date', '>=', weekDates[0]),
        where('date', '<=', weekEnd),
      ),
      (snap) => {
        setSavedDocs(snap.docs.map((d) => ({ id: d.id, ...d.data() } as GeneralAttendanceDocument & { id: string })));
      }
    );
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveClassId, institutionId, weekDates[0], weekEnd]);

  // ── Restore drafts for the current week ──
  useEffect(() => {
    if (!effectiveClassId || !institutionId) return;
    const restored: DraftStore = {};
    for (const dateISO of weekDates) {
      for (const session of ['AM', 'PM'] as Session[]) {
        const key: DraftKey = `${dateISO}_${session}`;
        restored[key] = getDraft(institutionId, effectiveClassId, dateISO, session);
      }
    }
    setDraftState(restored);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveClassId, institutionId, weekDates[0]]);

  // ── Week navigation ──
  function prevWeek() {
    const candidate = addDays(weekStart, -7);
    if (!termStart || toISO(candidate) < termStart.slice(0, 10)) return;
    setWeekStart(candidate);
  }

  function nextWeek() {
    const candidate = addDays(weekStart, 7);
    if (toISO(candidate) > today) return;
    setWeekStart(candidate);
  }

  const canGoBack = termStart ? toISO(addDays(weekStart, -7)) >= termStart : false;
  const canGoNext = toISO(addDays(weekStart, 7)) <= today;

  // ── Cell interaction ──
  function handleCellChange(dateISO: string, session: Session, studentId: string, state: AttendanceState) {
    if (!effectiveClassId || !institutionId) return;
    const key: DraftKey = `${dateISO}_${session}`;
    const current = draft[key] ?? {};
    const existing = current[studentId];
    const record: DraftRecord = { state, reason: state === 'E' ? (existing?.reason ?? '') : undefined };

    setDraftState((prev) => ({ ...prev, [key]: { ...current, [studentId]: record } }));
    setDraftCell(institutionId, effectiveClassId, dateISO, session, studentId, record);

    if (state === 'E') {
      setExcusedPopover(`${studentId}_${dateISO}_${session}`);
    } else if (excusedPopover?.startsWith(studentId)) {
      setExcusedPopover(null);
    }
  }

  function handleReasonChange(dateISO: string, session: Session, studentId: string, reason: string) {
    if (!effectiveClassId || !institutionId) return;
    const key: DraftKey = `${dateISO}_${session}`;
    const current = draft[key] ?? {};
    const record: DraftRecord = { state: 'E', reason };
    setDraftState((prev) => ({ ...prev, [key]: { ...current, [studentId]: record } }));
    setDraftCell(institutionId, effectiveClassId, dateISO, session, studentId, record);
  }

  // ── Save flow ──
  async function commitSave(dateISO: string, session: Session) {
    if (!user || !effectiveClassId || !institutionId || !activeTerm || !activeYear) return;
    const key: DraftKey = `${dateISO}_${session}`;
    const currentDraft = draft[key] ?? {};

    setSavingKey(key);
    setSaveError(null);

    try {
      const existingDoc = savedDocs.find((d) => d.date === dateISO && d.session === session);
      const docRef = existingDoc
        ? doc(db, 'generalAttendance', existingDoc.id)
        : doc(collection(db, 'generalAttendance'));

      const records: GeneralAttendanceDocument['records'] = {};
      for (const student of students) {
        const r = currentDraft[student.uid];
        if (r) {
          records[student.uid] = {
            state: r.state,
            studentName: student.name,
            ...(r.reason ? { reason: r.reason } : {}),
          };
        }
      }

      await setDoc(docRef, {
        institutionId,
        classId: effectiveClassId,
        className: effectiveClassName,
        termId: activeTerm.id,
        academicYearId: activeYear.id,
        date: dateISO,
        session,
        records,
        submittedBy: user.uid,
        submittedAt: serverTimestamp(),
        createdAt: existingDoc ? (existingDoc.createdAt as unknown) : serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      clearDraft(institutionId, effectiveClassId, dateISO, session);
      setSaveAttempted(false);
      setSaveSuccess(`${session} register for ${formatDateLabel(dateISO)} saved.`);
      setTimeout(() => setSaveSuccess(null), 3000);

      // Background upsert — does not block save feedback
      void rebuildSummariesForClass({
        classId: effectiveClassId,
        termId: activeTerm.id,
        academicYearId: activeYear.id,
        institutionId,
        termStartDate: activeTerm.startDate,
        termEndDate: activeTerm.endDate,
        schoolWeekDays: activeYear.schoolWeekDays,
        nonSchoolDays,
      }).catch(() => {});
    } catch {
      setSaveError('Save failed. Check your connection and try again.');
    } finally {
      setSavingKey(null);
    }
  }

  function handleSave(dateISO: string, session: Session) {
    const key: DraftKey = `${dateISO}_${session}`;
    const currentDraft = draft[key] ?? {};
    const emptyCount = students.filter((s) => !currentDraft[s.uid]).length;

    if (emptyCount === 0) {
      commitSave(dateISO, session);
      return;
    }
    if (!saveAttempted) {
      setSaveAttempted(true);
      setSaveError(`${emptyCount} student(s) have no attendance recorded. Save again to confirm.`);
      setActiveDate(dateISO);
      setActiveSession(session);
      return;
    }
    setActiveDate(dateISO);
    setActiveSession(session);
    setConfirmDialogOpen(true);
  }

  // ── Overdue detection ──
  function isOverdue(dateISO: string, session: Session): boolean {
    if (dateISO > today) return false;
    if (!isSessionWindowClosed(session)) return false;
    return !savedDocs.some((d) => d.date === dateISO && d.session === session && d.submittedAt);
  }

  // ── Cell disabled logic ──
  function isCellDisabled(dateISO: string): boolean {
    if (dateISO > today) return true;
    if (!activeYear) return true;
    return !isSchoolDay(dateISO, activeYear.schoolWeekDays, nonSchoolDays);
  }

  // ── Read-only mode: outside current term ──
  const isReadOnly = !activeTerm || weekDates[0] > termEnd || weekDates[6] < termStart;

  // ── Render ──
  if (USE_MOCK) return <InfoState message="General Attendance Register is not available in demo mode." />;
  if (calTimedOut) return <InfoState message="Something went wrong. Please contact your administrator." />;
  if (calLoading || profileLoading) return <Spinner />;
  if (!activeYear || !activeTerm) return <InfoState message="No active academic term is configured. Set up the Academic Calendar first." />;
  if (role === 'senior_teacher' && !assignedClassId) return <InfoState message="You have no homeroom class assigned. Please contact your institution's administrator." />;

  const schoolDays = weekDates.filter((d) => activeYear && isSchoolDay(d, activeYear.schoolWeekDays, nonSchoolDays));

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">General Attendance Register</h1>
          {effectiveClassName && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{effectiveClassName}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExportModalOpen(true)}
          className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline"
        >
          Export PDF
        </button>

        {/* Class selector for admin/super_admin */}
        {role !== 'senior_teacher' && (
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Select a class…</option>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
      </div>

      {/* Week navigator */}
      <div className="flex items-center gap-3 mb-4">
        <button
          type="button"
          onClick={prevWeek}
          disabled={!canGoBack}
          className="p-1.5 rounded-md border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
          aria-label="Previous week"
        >
          ←
        </button>
        <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
          Week of {formatDateLabel(weekDates[0])}
        </span>
        <button
          type="button"
          onClick={nextWeek}
          disabled={!canGoNext}
          className="p-1.5 rounded-md border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-300 disabled:opacity-40"
          aria-label="Next week"
        >
          →
        </button>
        {isReadOnly && (
          <span className="text-xs text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 rounded-full px-2 py-0.5">
            Read-only (past term)
          </span>
        )}
      </div>

      {/* Status messages */}
      {saveSuccess && (
        <div className="mb-3 rounded-md bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-700 dark:text-green-300">
          {saveSuccess}
        </div>
      )}
      {saveError && (
        <div className="mb-3 rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
          {saveError}
          {saveAttempted && (
            <button
              type="button"
              className="ml-2 underline font-medium"
              onClick={() => setConfirmDialogOpen(true)}
            >
              Save anyway
            </button>
          )}
        </div>
      )}

      {!effectiveClassId ? (
        <InfoState message="Select a class to view the register." />
      ) : students.length === 0 ? (
        <InfoState message="No students found for this class." />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
          <table className="w-full text-sm border-collapse">
            <thead className="bg-gray-50 dark:bg-gray-800">
              <tr>
                <th className="sticky left-0 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200 min-w-[140px]">
                  Student
                </th>
                {weekDates.map((dateISO) => {
                  const isSD = activeYear && isSchoolDay(dateISO, activeYear.schoolWeekDays, nonSchoolDays);
                  return (
                    <th
                      key={dateISO}
                      colSpan={2}
                      className={`px-2 py-2 text-center font-medium text-xs ${isSD ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}`}
                    >
                      <div>{formatDayLabel(dateISO)}</div>
                      <div className="font-normal">{formatDateLabel(dateISO)}</div>
                      <div className="flex gap-0.5 justify-center mt-1">
                        {(['AM', 'PM'] as Session[]).map((s) => (
                          <span
                            key={s}
                            className={`text-[10px] px-1 rounded ${
                              isOverdue(dateISO, s)
                                ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                : 'text-gray-400 dark:text-gray-500'
                            }`}
                          >
                            {s}
                          </span>
                        ))}
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
              {students.map((student) => (
                <tr key={student.uid} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                  <td className="sticky left-0 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">
                    {student.name}
                  </td>
                  {weekDates.map((dateISO) => {
                    const disabled = isCellDisabled(dateISO);
                    return (['AM', 'PM'] as Session[]).map((session) => {
                      const key: DraftKey = `${dateISO}_${session}`;
                      const cellDraft = draft[key]?.[student.uid];
                      const savedDoc = savedDocs.find((d) => d.date === dateISO && d.session === session);
                      const savedState = savedDoc?.records[student.uid]?.state ?? null;
                      const displayState = cellDraft?.state ?? savedState ?? null;
                      const popoverKey = `${student.uid}_${dateISO}_${session}`;
                      const hasSaveError = saveAttempted && !cellDraft && !savedState;

                      return (
                        <td key={`${dateISO}_${session}`} className="px-1 py-2 text-center relative">
                          {isReadOnly ? (
                            displayState ? (
                              <span
                                className={`inline-flex items-center justify-center w-8 h-8 rounded text-xs font-bold text-white ${
                                  displayState === 'P' ? 'bg-green-500' :
                                  displayState === 'A' ? 'bg-red-500' :
                                  displayState === 'L' ? 'bg-orange-400' :
                                  displayState === 'E' ? 'bg-blue-500' : 'bg-purple-500'
                                }`}
                              >
                                {displayState}
                              </span>
                            ) : (
                              <div className="w-8 h-8 rounded bg-gray-100 dark:bg-gray-800 mx-auto" />
                            )
                          ) : (
                            <div className="relative inline-block">
                              <AttendanceStateButton
                                value={displayState}
                                onChange={(s) => handleCellChange(dateISO, session, student.uid, s)}
                                disabled={disabled}
                                hasSaveError={hasSaveError}
                              />
                              {excusedPopover === popoverKey && (
                                <ExcusedReasonPopover
                                  studentName={student.name}
                                  reason={cellDraft?.reason ?? ''}
                                  onReasonChange={(r) => handleReasonChange(dateISO, session, student.uid, r)}
                                  onClose={() => setExcusedPopover(null)}
                                />
                              )}
                            </div>
                          )}
                        </td>
                      );
                    });
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Save controls — one per school day × session */}
      {!isReadOnly && effectiveClassId && students.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {schoolDays.flatMap((dateISO) =>
            (['AM', 'PM'] as Session[]).map((session) => {
              const key: DraftKey = `${dateISO}_${session}`;
              const hasDraft = Object.keys(draft[key] ?? {}).length > 0;
              const isSaved = savedDocs.some((d) => d.date === dateISO && d.session === session && d.submittedAt);
              const saving = savingKey === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSave(dateISO, session)}
                  disabled={saving || (!hasDraft && isSaved)}
                  className={`text-xs font-medium rounded-md px-3 py-1.5 border ${
                    saving
                      ? 'bg-gray-100 dark:bg-gray-800 text-gray-400 border-gray-200 dark:border-gray-700'
                      : hasDraft
                      ? 'bg-sky-500 text-white border-sky-500 hover:bg-sky-600'
                      : isSaved
                      ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border-green-200 dark:border-green-700'
                      : 'bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700'
                  }`}
                >
                  {saving
                    ? 'Saving…'
                    : isSaved && !hasDraft
                    ? `${session} ${formatDateLabel(dateISO)} ✓`
                    : `Save ${session} ${formatDateLabel(dateISO)}`}
                </button>
              );
            })
          )}
        </div>
      )}

      {/* PDF export scope modal */}
      <AttendanceScopeModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        defaultClassId={effectiveClassId || undefined}
      />

      {/* Confirm dialog */}
      {confirmDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Confirm Save</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Some students still have no attendance state. These sessions will not be counted in any attendance total. Save anyway?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setConfirmDialogOpen(false); setSaveAttempted(false); setSaveError(null); }}
                className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setConfirmDialogOpen(false); commitSave(activeDate, activeSession); }}
                className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
              >
                Save anyway
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
