import { useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { db, ClassDocument, SubjectDocument, NonSchoolDayDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { AttendanceStateButton } from '@/components/attendance/AttendanceStateButton';
import { ExcusedReasonPopover } from '@/components/attendance/ExcusedReasonPopover';
import { DraftRecord, purgeExpiredDrafts } from '@/lib/attendanceDraft';
import { isSchoolDay, isFortnightlySessionDay } from '@/lib/attendanceCalendar';

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceState = 'P' | 'A' | 'L' | 'S' | 'E';

interface StudentRow {
  uid: string;
  name: string;
  surname: string;
}

interface SubjectAttendanceDoc {
  id: string;
  sessionDate: string;
  submittedAt: unknown;
  records: Record<string, { state: string; studentName: string; reason?: string }>;
}

// ─── Subject-scoped draft helpers ─────────────────────────────────────────────
// Key pattern: attendance_draft_subject_{institutionId}_{subjectId}_{classId}_{YYYY-MM-DD}

const SUBJECT_DRAFT_PREFIX = 'attendance_draft_subject_';

function getSubjectDraft(
  institutionId: string, subjectId: string, classId: string, date: string,
): Record<string, DraftRecord> {
  try {
    const raw = localStorage.getItem(
      `${SUBJECT_DRAFT_PREFIX}${institutionId}_${subjectId}_${classId}_${date}`
    );
    return raw ? (JSON.parse(raw) as Record<string, DraftRecord>) : {};
  } catch { return {}; }
}

function setSubjectDraftCell(
  institutionId: string, subjectId: string, classId: string, date: string,
  studentId: string, record: DraftRecord,
): void {
  const k = `${SUBJECT_DRAFT_PREFIX}${institutionId}_${subjectId}_${classId}_${date}`;
  const current = getSubjectDraft(institutionId, subjectId, classId, date);
  localStorage.setItem(k, JSON.stringify({ ...current, [studentId]: record }));
}

function clearSubjectDraft(
  institutionId: string, subjectId: string, classId: string, date: string,
): void {
  localStorage.removeItem(
    `${SUBJECT_DRAFT_PREFIX}${institutionId}_${subjectId}_${classId}_${date}`
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toISO(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
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

function isSubjectSessionDay(
  dateStr: string,
  subject: SubjectDocument,
  termStartDate: string,
  schoolWeekDays: number[],
  nonSchoolDays: NonSchoolDayDocument[],
): boolean {
  if (!isSchoolDay(dateStr, schoolWeekDays, nonSchoolDays)) return false;
  if (subject.frequency === 'custom') {
    return (subject.customFrequencyDays ?? []).includes(dateStr);
  }
  const dayOfWeek = new Date(dateStr + 'T12:00:00Z').getUTCDay();
  if (!(subject.sessionDayOfWeek ?? []).includes(dayOfWeek)) return false;
  if (subject.frequency === 'fortnightly') {
    return isFortnightlySessionDay(dateStr, termStartDate, subject.fortnightlyOffset ?? 0);
  }
  return true;
}

function isOverdueDate(
  dateStr: string,
  today: string,
  savedDates: Set<string>,
): boolean {
  if (dateStr > today) return false;
  if (dateStr < today) return !savedDates.has(dateStr);
  // Today: past 15:00 JST (UTC−5 = 20:00 UTC)
  const nowJST = new Date(Date.now() - 5 * 60 * 60 * 1000);
  return nowJST.getUTCHours() >= 15 && !savedDates.has(dateStr);
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

export default function SubjectAttendancePage() {
  const { user, role, institutionId } = useAuth();
  const { activeYear, activeTerm, nonSchoolDays, loading: calLoading } = useInstitutionAcademicCalendar();

  // Subject list
  const [subjects, setSubjects] = useState<(SubjectDocument & { id: string })[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState('');
  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) ?? null;

  // All institution classes (used for institution-scoped subjects and the class dropdown)
  const [allClasses, setAllClasses] = useState<(ClassDocument & { id: string })[]>([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const selectedClassName = allClasses.find((c) => c.id === selectedClassId)?.name ?? '';

  // Enrolled students for the selected subject + class
  const [enrolledStudents, setEnrolledStudents] = useState<StudentRow[]>([]);

  // Week navigation
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart(new Date()));
  const today = toISO(new Date());

  // Saved Firestore docs for the current week
  const [savedDocs, setSavedDocs] = useState<SubjectAttendanceDoc[]>([]);

  // Draft state: keyed by dateISO
  const [draft, setDraftState] = useState<Record<string, Record<string, DraftRecord>>>({});

  // Save flow
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [activeSaveDate, setActiveSaveDate] = useState('');

  // Excused reason popover: keyed by `${studentId}_${dateISO}`
  const [excusedPopover, setExcusedPopover] = useState<string | null>(null);

  const weekDates = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)));
  const termStart = activeTerm?.startDate ?? '';
  const termEnd   = activeTerm?.endDate   ?? '';
  const weekEnd   = weekDates[6];

  // ── Load subjects ──
  useEffect(() => {
    if (USE_MOCK || !institutionId || !user) return;
    const q = role === 'regular_teacher'
      ? query(
          collection(db, 'subjects'),
          where('institutionId', '==', institutionId),
          where('teacherIds', 'array-contains', user.uid),
        )
      : query(collection(db, 'subjects'), where('institutionId', '==', institutionId));
    getDocs(q).then((snap) => {
      setSubjects(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() } as SubjectDocument & { id: string }))
          .sort((a, b) => a.name.localeCompare(b.name))
      );
    });
  }, [institutionId, user, role]);

  // ── Load all institution classes ──
  useEffect(() => {
    if (USE_MOCK || !institutionId) return;
    getDocs(query(collection(db, 'classes'), where('institutionId', '==', institutionId)))
      .then((snap) =>
        setAllClasses(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() } as ClassDocument & { id: string }))
            .sort((a, b) => a.name.localeCompare(b.name))
        )
      );
  }, [institutionId]);

  // ── Auto-select class when subject scope is 'class' with exactly one class ──
  useEffect(() => {
    if (!selectedSubject) { setSelectedClassId(''); return; }
    if (selectedSubject.classScope === 'class' && selectedSubject.classIds.length === 1) {
      setSelectedClassId(selectedSubject.classIds[0]);
    } else {
      setSelectedClassId('');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubjectId]);

  // ── Load enrolled students whenever subject+class changes ──
  useEffect(() => {
    if (!selectedSubjectId || !selectedClassId || !institutionId) {
      setEnrolledStudents([]);
      return;
    }
    Promise.all([
      getDocs(
        query(
          collection(db, 'users'),
          where('institutionId', '==', institutionId),
          where('role', '==', 'student'),
          where('classId', '==', selectedClassId),
        )
      ),
      getDoc(doc(db, 'subjectEnrollments', `${selectedSubjectId}_${selectedClassId}`)),
    ]).then(([studentsSnap, enrollmentDoc]) => {
      const allStudents: StudentRow[] = studentsSnap.docs.map((d) => ({
        uid: d.id,
        name: (d.data().name as string) ?? d.id,
        surname: surname((d.data().name as string) ?? d.id),
      }));

      let filtered = allStudents;
      if (enrollmentDoc.exists()) {
        const enrollment = enrollmentDoc.data();
        if (enrollment.enrollmentType === 'selective') {
          const excluded = (enrollment.excludedStudentIds as string[]) ?? [];
          filtered = allStudents.filter((s) => !excluded.includes(s.uid));
        }
      }
      filtered.sort((a, b) => a.surname.localeCompare(b.surname));
      setEnrolledStudents(filtered);
    });
  }, [selectedSubjectId, selectedClassId, institutionId]);

  // ── Purge expired general attendance drafts on mount ──
  useEffect(() => {
    if (termStart) purgeExpiredDrafts(termStart);
  }, [termStart]);

  // ── Live query for saved docs in the current week ──
  useEffect(() => {
    if (!selectedSubjectId || !selectedClassId || !institutionId) { setSavedDocs([]); return; }
    const unsub = onSnapshot(
      query(
        collection(db, 'subjectAttendance'),
        where('institutionId', '==', institutionId),
        where('subjectId', '==', selectedSubjectId),
        where('classId', '==', selectedClassId),
        where('sessionDate', '>=', weekDates[0]),
        where('sessionDate', '<=', weekEnd),
      ),
      (snap) => {
        setSavedDocs(
          snap.docs.map((d) => ({
            id: d.id,
            sessionDate: d.data().sessionDate as string,
            submittedAt: d.data().submittedAt,
            records: d.data().records as SubjectAttendanceDoc['records'],
          }))
        );
      }
    );
    return unsub;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubjectId, selectedClassId, institutionId, weekDates[0], weekEnd]);

  // ── Restore drafts when week or subject+class changes ──
  useEffect(() => {
    if (!selectedSubjectId || !selectedClassId || !institutionId) return;
    const restored: Record<string, Record<string, DraftRecord>> = {};
    for (const dateISO of weekDates) {
      restored[dateISO] = getSubjectDraft(institutionId, selectedSubjectId, selectedClassId, dateISO);
    }
    setDraftState(restored);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubjectId, selectedClassId, institutionId, weekDates[0]]);

  // ── Week navigation ──
  function prevWeek() {
    const candidate = addDays(weekStart, -7);
    if (!termStart || toISO(candidate) < termStart) return;
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
  function handleCellChange(dateISO: string, studentId: string, state: AttendanceState) {
    if (!selectedSubjectId || !selectedClassId || !institutionId) return;
    const current = draft[dateISO] ?? {};
    const existing = current[studentId];
    const record: DraftRecord = {
      state,
      reason: state === 'E' ? (existing?.reason ?? '') : undefined,
    };
    setDraftState((prev) => ({ ...prev, [dateISO]: { ...current, [studentId]: record } }));
    setSubjectDraftCell(institutionId, selectedSubjectId, selectedClassId, dateISO, studentId, record);

    if (state === 'E') {
      setExcusedPopover(`${studentId}_${dateISO}`);
    } else if (excusedPopover?.startsWith(studentId)) {
      setExcusedPopover(null);
    }
  }

  function handleReasonChange(dateISO: string, studentId: string, reason: string) {
    if (!selectedSubjectId || !selectedClassId || !institutionId) return;
    const current = draft[dateISO] ?? {};
    const record: DraftRecord = { state: 'E', reason };
    setDraftState((prev) => ({ ...prev, [dateISO]: { ...current, [studentId]: record } }));
    setSubjectDraftCell(institutionId, selectedSubjectId, selectedClassId, dateISO, studentId, record);
  }

  // ── Save flow ──
  async function commitSave(dateISO: string) {
    if (!user || !selectedSubjectId || !selectedClassId || !institutionId || !activeTerm || !activeYear) return;
    const currentDraft = draft[dateISO] ?? {};

    setSavingDate(dateISO);
    setSaveError(null);

    try {
      const existingDoc = savedDocs.find((d) => d.sessionDate === dateISO);
      const docRef = existingDoc
        ? doc(db, 'subjectAttendance', existingDoc.id)
        : doc(collection(db, 'subjectAttendance'));

      const records: SubjectAttendanceDoc['records'] = {};
      for (const student of enrolledStudents) {
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
        subjectId: selectedSubjectId,
        subjectName: selectedSubject?.name ?? '',
        classId: selectedClassId,
        className: selectedClassName,
        sessionDate: dateISO,
        teacherId: user.uid,
        termId: activeTerm.id,
        academicYearId: activeYear.id,
        records,
        submittedBy: user.uid,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(!existingDoc ? { createdAt: serverTimestamp() } : {}),
      });

      clearSubjectDraft(institutionId, selectedSubjectId, selectedClassId, dateISO);
      setSaveAttempted(false);
      setSaveSuccess(`Session register for ${formatDateLabel(dateISO)} saved.`);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch {
      setSaveError('Save failed. Check your connection and try again.');
    } finally {
      setSavingDate(null);
    }
  }

  function handleSave(dateISO: string) {
    const currentDraft = draft[dateISO] ?? {};
    const emptyCount = enrolledStudents.filter((s) => !currentDraft[s.uid]).length;

    if (emptyCount === 0) {
      commitSave(dateISO);
      return;
    }
    if (!saveAttempted) {
      setSaveAttempted(true);
      setSaveError(`${emptyCount} student(s) have no attendance recorded. Save again to confirm.`);
      setActiveSaveDate(dateISO);
      return;
    }
    setActiveSaveDate(dateISO);
    setConfirmDialogOpen(true);
  }

  // ── Derived values (computed before render guards so hooks stay unconditional) ──
  const savedDates = new Set(savedDocs.map((d) => d.sessionDate));

  const isReadOnly = !activeTerm || weekDates[0] > termEnd || weekDates[6] < termStart;

  const sessionDates = selectedSubject && activeYear
    ? weekDates.filter((d) =>
        isSubjectSessionDay(d, selectedSubject, termStart, activeYear.schoolWeekDays, nonSchoolDays)
      )
    : [];

  const hasNoSchedule = !!selectedSubject && !selectedSubject.frequency;

  const classesForDropdown =
    selectedSubject?.classScope === 'institution'
      ? allClasses
      : allClasses.filter((c) => selectedSubject?.classIds.includes(c.id) ?? false);

  const showClassSelector =
    !!selectedSubject &&
    (selectedSubject.classScope === 'institution' || selectedSubject.classIds.length > 1);

  // ── Render ──
  if (USE_MOCK) return <InfoState message="Subject Attendance Register is not available in demo mode." />;
  if (calLoading) return <Spinner />;
  if (!activeYear || !activeTerm) return <InfoState message="No active academic term is configured. Set up the Academic Calendar first." />;

  return (
    <div className="p-4 sm:p-6">
      {/* Header + selectors */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Subject Attendance Register</h1>
          {selectedSubject && selectedClassName && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {selectedSubject.name} · {selectedClassName}
            </p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={selectedSubjectId}
            onChange={(e) => {
              setSelectedSubjectId(e.target.value);
              setSaveAttempted(false);
              setSaveError(null);
            }}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Select a subject…</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>

          {showClassSelector && (
            <select
              value={selectedClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setSaveAttempted(false);
                setSaveError(null);
              }}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              <option value="">Select a class…</option>
              {classesForDropdown.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Info states */}
      {!selectedSubjectId && subjects.length === 0 && (
        <InfoState message="No subjects found. Subjects must be configured by your institution admin before you can submit attendance." />
      )}
      {!selectedSubjectId && subjects.length > 0 && (
        <InfoState message="Select a subject above to view its register." />
      )}
      {selectedSubject && hasNoSchedule && (
        <InfoState message="This subject has no session schedule configured. Edit the subject to add a frequency and session days." />
      )}
      {selectedSubject && !hasNoSchedule && showClassSelector && !selectedClassId && (
        <InfoState message="Select a class above to view the register." />
      )}

      {/* Main register content */}
      {selectedSubject && !hasNoSchedule && selectedClassId && (
        <>
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

          {sessionDates.length === 0 && (
            <InfoState message="No sessions scheduled for this week. Use the navigation to find a week with sessions." />
          )}

          {sessionDates.length > 0 && enrolledStudents.length === 0 && (
            <InfoState message="No students are enrolled in this subject for this class." />
          )}

          {/* Register grid */}
          {sessionDates.length > 0 && enrolledStudents.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
              <table className="w-full text-sm border-collapse">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="sticky left-0 bg-gray-50 dark:bg-gray-800 px-3 py-2 text-left font-medium text-gray-700 dark:text-gray-200 min-w-[140px]">
                      Student
                    </th>
                    {sessionDates.map((dateISO) => (
                      <th
                        key={dateISO}
                        className="px-3 py-2 text-center font-medium text-xs text-gray-700 dark:text-gray-200"
                      >
                        <div>{formatDayLabel(dateISO)}</div>
                        <div className="font-normal">{formatDateLabel(dateISO)}</div>
                        {isOverdueDate(dateISO, today, savedDates) && (
                          <div className="mt-1">
                            <span className="text-[10px] px-1 rounded bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400">
                              Overdue
                            </span>
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {enrolledStudents.map((student) => (
                    <tr key={student.uid} className="bg-white dark:bg-gray-900 hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="sticky left-0 bg-white dark:bg-gray-900 px-3 py-2 text-gray-900 dark:text-gray-100 whitespace-nowrap">
                        {student.name}
                      </td>
                      {sessionDates.map((dateISO) => {
                        const isFuture = dateISO > today;
                        const cellDraft = draft[dateISO]?.[student.uid];
                        const savedDoc = savedDocs.find((d) => d.sessionDate === dateISO);
                        const savedState = (savedDoc?.records[student.uid]?.state ?? null) as AttendanceState | null;
                        const displayState = (cellDraft?.state ?? savedState) as AttendanceState | null;
                        const popoverKey = `${student.uid}_${dateISO}`;
                        const hasSaveError = saveAttempted && activeSaveDate === dateISO && !cellDraft && !savedState;

                        return (
                          <td key={dateISO} className="px-1 py-2 text-center relative">
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
                                  onChange={(s) => handleCellChange(dateISO, student.uid, s)}
                                  disabled={isFuture}
                                  hasSaveError={hasSaveError}
                                />
                                {excusedPopover === popoverKey && (
                                  <ExcusedReasonPopover
                                    studentName={student.name}
                                    reason={cellDraft?.reason ?? ''}
                                    onReasonChange={(r) => handleReasonChange(dateISO, student.uid, r)}
                                    onClose={() => setExcusedPopover(null)}
                                  />
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Save controls — one per past/present session date */}
          {!isReadOnly && enrolledStudents.length > 0 && sessionDates.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {sessionDates
                .filter((d) => d <= today)
                .map((dateISO) => {
                  const hasDraft = Object.keys(draft[dateISO] ?? {}).length > 0;
                  const isSaved = savedDocs.some((d) => d.sessionDate === dateISO && d.submittedAt);
                  const saving = savingDate === dateISO;
                  return (
                    <button
                      key={dateISO}
                      type="button"
                      onClick={() => handleSave(dateISO)}
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
                        ? `${formatDateLabel(dateISO)} ✓`
                        : `Save ${formatDateLabel(dateISO)}`}
                    </button>
                  );
                })}
            </div>
          )}
        </>
      )}

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
                onClick={() => {
                  setConfirmDialogOpen(false);
                  setSaveAttempted(false);
                  setSaveError(null);
                }}
                className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDialogOpen(false);
                  commitSave(activeSaveDate);
                }}
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
