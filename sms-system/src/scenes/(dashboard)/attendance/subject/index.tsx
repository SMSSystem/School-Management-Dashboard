import { useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, SubjectDocument, NonSchoolDayDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { actorName, buildAuditEntry, staffFallback } from '@/lib/auditLog';
import { subjectAttendanceDetail } from '@/lib/teacherAudit';
import { USE_MOCK } from '@/lib/data';
import { institutionCollection, institutionDoc } from '@/lib/paths';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { AttendanceStateButton, STATE_CLASS } from '@/components/attendance/AttendanceStateButton';
import { ExcusedReasonPopover } from '@/components/attendance/ExcusedReasonPopover';
import { DraftRecord, purgeExpiredDrafts } from '@/lib/attendanceDraft';
import { isSchoolDay, isFortnightlySessionDay } from '@/lib/attendanceCalendar';
import { getPersistedFilter, setPersistedFilter } from '@/lib/filterPersistence';
import type { AttendanceState } from '@/lib/attendanceStates';
import FillColumnButton from '@/components/attendance/FillColumnButton';
import FillConfirmDialog from '@/components/attendance/FillConfirmDialog';
import MissingStudentsList from '@/components/attendance/MissingStudentsList';
import { missingBySession, studentsToFill } from '@/lib/attendanceMissing';
import { useInstitutionClasses } from '@/hooks/useInstitutionClasses';
import { useInstitutionSubjects } from '@/hooks/useInstitutionSubjects';
import { byName } from '@/lib/sortByName';

const FILTER_PAGE = 'subject_attendance';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StudentRow {
  uid: string;
  name: string;
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
  const { user, role, institutionId, institution, displayName } = useAuth();
  const {
    activeYear, activeTerm, nonSchoolDays,
    activeTimeBlocks, nonSchoolDaysByTermId,
    loading: calLoading, timedOut: calTimedOut,
  } = useInstitutionAcademicCalendar();
  const isCustomMode = institution?.calendarMode === 'custom';

  // Subject list — selection restored from the last selection made this
  // session (cleared on logout), per DEV_NOTES Item 6.1.
  const { data: rawSubjects = [] } = useInstitutionSubjects();
  const subjects = useMemo(
    () => [...rawSubjects].sort((a, b) => a.name.localeCompare(b.name)),
    [rawSubjects],
  );
  const [selectedSubjectId, setSelectedSubjectId] = useState(() => getPersistedFilter(FILTER_PAGE, 'selectedSubjectId'));
  const selectedSubject = subjects.find((s) => s.id === selectedSubjectId) ?? null;

  // All institution classes (used for institution-scoped subjects and the class dropdown)
  const { data: rawAllClasses = [] } = useInstitutionClasses();
  const allClasses = useMemo(
    () => [...rawAllClasses].sort((a, b) => a.name.localeCompare(b.name)),
    [rawAllClasses],
  );
  const [selectedClassId, setSelectedClassId] = useState(() => getPersistedFilter(FILTER_PAGE, 'selectedClassId'));
  const selectedClassName = allClasses.find((c) => c.id === selectedClassId)?.name ?? '';

  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, 'selectedSubjectId', selectedSubjectId);
  }, [selectedSubjectId]);

  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, 'selectedClassId', selectedClassId);
  }, [selectedClassId]);

  // ── Time Block selector (§3.2, custom-mode only) — scopes classesForDropdown
  // below. Falls back to activeTimeBlocks[0] (the confirmed default-selection
  // rule, §3 — the hook already returns this list pre-sorted) rather than a
  // separate "default it" effect, so there's no render where a valid block
  // list exists but nothing is selected yet. Deliberately doesn't also try to
  // follow whichever class ends up selected (unlike General Attendance's
  // senior_teacher case) — subjects aren't themselves time-block-scoped, so
  // there's no single unambiguous class to derive a fallback from here, and
  // the dropdown is always visible for the admin to correct manually.
  const [selectedBlockTermId, setSelectedBlockTermId] = useState(() => getPersistedFilter(FILTER_PAGE, 'selectedBlockTermId'));
  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, 'selectedBlockTermId', selectedBlockTermId);
  }, [selectedBlockTermId]);
  const persistedBlockValid = activeTimeBlocks.some((b) => b.term.id === selectedBlockTermId);
  const selectedBlock = persistedBlockValid
    ? activeTimeBlocks.find((b) => b.term.id === selectedBlockTermId)!
    : activeTimeBlocks[0] ?? null;

  const effectiveYear = isCustomMode ? selectedBlock?.year ?? null : activeYear;
  const effectiveTerm = isCustomMode ? selectedBlock?.term ?? null : activeTerm;
  const effectiveNonSchoolDays = isCustomMode
    ? (effectiveTerm ? nonSchoolDaysByTermId[effectiveTerm.id] ?? [] : [])
    : nonSchoolDays;

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
  const termStart = effectiveTerm?.startDate ?? '';
  const termEnd   = effectiveTerm?.endDate   ?? '';
  const weekEnd   = weekDates[6];

  // ── Auto-select class when subject scope is 'class' with exactly one class;
  // otherwise keep a still-valid selection (including one restored from a
  // persisted filter) and clear only once it's confirmed invalid — per
  // DEV_NOTES Item 6.1. subjects.length gates against clearing before subjects
  // have loaded (selectedSubject briefly resolves to null pre-load even when
  // selectedSubjectId is already set, e.g. right after a persisted restore). ──
  useEffect(() => {
    if (!selectedSubjectId) { setSelectedClassId(''); return; }
    if (subjects.length === 0) return;
    if (!selectedSubject) { setSelectedClassId(''); return; }
    if (selectedSubject.classScope === 'class') {
      if (selectedSubject.classIds.length === 1) {
        setSelectedClassId(selectedSubject.classIds[0]);
      } else {
        setSelectedClassId((prev) => (selectedSubject.classIds.includes(prev) ? prev : ''));
      }
    } else {
      // Institution-scoped: any class in allClasses is valid. allClasses.length === 0
      // means classes haven't loaded yet — keep the current value rather than guess,
      // and rely on allClasses being a dependency below to re-run this check once
      // the real class list arrives (otherwise a stale/deleted classId persisted
      // from a previous session would never get revalidated).
      setSelectedClassId((prev) => (allClasses.length === 0 || allClasses.some((c) => c.id === prev) ? prev : ''));
    }
  }, [selectedSubjectId, subjects.length, selectedSubject, allClasses]);

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
      getDoc(institutionDoc(institutionId, 'subjectEnrollments', `${selectedSubjectId}_${selectedClassId}`)),
    ]).then(([studentsSnap, enrollmentDoc]) => {
      const allStudents: StudentRow[] = studentsSnap.docs.map((d) => ({
        uid: d.id,
        name: (d.data().name as string) ?? d.id,
      }));

      let filtered = allStudents;
      if (enrollmentDoc.exists()) {
        const enrollment = enrollmentDoc.data();
        if (enrollment.enrollmentType === 'selective') {
          const excluded = (enrollment.excludedStudentIds as string[]) ?? [];
          filtered = allStudents.filter((s) => !excluded.includes(s.uid));
        }
      }
      filtered.sort(byName((s: StudentRow) => s.name));
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
        institutionCollection(institutionId, 'subjectAttendance'),
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
    const existing = draft[dateISO]?.[studentId];
    const record: DraftRecord = {
      state,
      reason: state === 'E' ? (existing?.reason ?? '') : undefined,
    };
    // Merges into prev[dateISO], not a `current` captured from this render:
    // the bulk Fill calls this once per student in one synchronous pass, and a
    // captured snapshot would let each call overwrite the one before it, leaving
    // only the last student filled in state (the localStorage draft is unaffected).
    setDraftState((prev) => ({ ...prev, [dateISO]: { ...prev[dateISO], [studentId]: record } }));
    setSubjectDraftCell(institutionId, selectedSubjectId, selectedClassId, dateISO, studentId, record);

    if (state === 'E') {
      setExcusedPopover(`${studentId}_${dateISO}`);
    } else if (excusedPopover?.startsWith(studentId)) {
      setExcusedPopover(null);
    }
  }

  function handleReasonChange(dateISO: string, studentId: string, reason: string) {
    if (!selectedSubjectId || !selectedClassId || !institutionId) return;
    const record: DraftRecord = { state: 'E', reason };
    setDraftState((prev) => ({ ...prev, [dateISO]: { ...prev[dateISO], [studentId]: record } }));
    setSubjectDraftCell(institutionId, selectedSubjectId, selectedClassId, dateISO, studentId, record);
  }

  // Effective per-student state for a date: the in-memory draft entry if one
  // exists, else whatever's already saved for that student. Without this,
  // a draft cleared by commitSave/remount (see effectiveRecord's twin in
  // attendance/general/index.tsx for the exact mechanism) makes a lone
  // post-remount cell edit look like every OTHER student has no attendance
  // recorded at all — both for the incomplete-save warning below and, more
  // seriously, for what commitSave's non-merge setDoc actually writes.
  function effectiveRecord(
    dateISO: string,
    studentUid: string,
  ): { state: string; reason?: string } | undefined {
    const draftRecord = draft[dateISO]?.[studentUid];
    if (draftRecord) return draftRecord;
    const saved = savedDocs.find((d) => d.sessionDate === dateISO)?.records[studentUid];
    return saved ? { state: saved.state, reason: saved.reason } : undefined;
  }

  // ── Bulk fill: the "Fill" button in a date column's header ──
  // Picks a state for every enrolled student with no state yet on that date
  // (nobody already marked changes, saved or draft). It goes through the same
  // handleCellChange as a hand click, so the Save buttons and the "save anyway?"
  // warning treat filled cells exactly like marked ones. Excused is not offered:
  // it needs a reason per student (lib/attendanceMissing.ts).
  const [fillPickerDate, setFillPickerDate] = useState<string | null>(null);
  const [fillConfirm, setFillConfirm] = useState<{
    dateISO: string;
    state: AttendanceState;
    emptyCount: number;
  } | null>(null);

  function handleFillPick(dateISO: string, state: AttendanceState) {
    setFillPickerDate(null);
    const emptyCount = studentsToFill(enrolledStudents, (uid) => !!effectiveRecord(dateISO, uid)).length;
    if (emptyCount === 0) return; // everyone already has a state: nothing to fill
    setFillConfirm({ dateISO, state, emptyCount });
  }

  function commitFill() {
    if (!fillConfirm) return;
    const { dateISO, state } = fillConfirm;
    for (const student of studentsToFill(enrolledStudents, (uid) => !!effectiveRecord(dateISO, uid))) {
      handleCellChange(dateISO, student.uid, state);
    }
    setFillConfirm(null);
  }

  // ── Save flow ──
  async function commitSave(dateISO: string) {
    if (!user || !selectedSubjectId || !selectedClassId || !institutionId || !effectiveTerm || !effectiveYear) return;

    setSavingDate(dateISO);
    setSaveError(null);

    try {
      const existingDoc = savedDocs.find((d) => d.sessionDate === dateISO);
      const docRef = existingDoc
        ? institutionDoc(institutionId, 'subjectAttendance', existingDoc.id)
        : doc(institutionCollection(institutionId, 'subjectAttendance'));

      const records: SubjectAttendanceDoc['records'] = {};
      for (const student of enrolledStudents) {
        const r = effectiveRecord(dateISO, student.uid);
        if (r) {
          records[student.uid] = {
            state: r.state,
            studentName: student.name,
            ...(r.reason ? { reason: r.reason } : {}),
          };
        }
      }

      // The register and its audit entry in ONE batch, so a register is never
      // saved unrecorded.
      const batch = writeBatch(db);
      batch.set(docRef, {
        institutionId,
        subjectId: selectedSubjectId,
        subjectName: selectedSubject?.name ?? '',
        classId: selectedClassId,
        className: selectedClassName,
        sessionDate: dateISO,
        teacherId: user.uid,
        termId: effectiveTerm.id,
        academicYearId: effectiveYear.id,
        records,
        submittedBy: user.uid,
        submittedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        ...(!existingDoc ? { createdAt: serverTimestamp() } : {}),
      });
      if (institutionId !== '*') {
        batch.set(
          doc(institutionCollection(institutionId, 'audit_log')),
          buildAuditEntry({
            institutionId,
            eventType: 'attendance_edit',
            detail: subjectAttendanceDetail({
              className: selectedClassName,
              subjectName: selectedSubject?.name ?? '',
              dateISO,
              recorded: Object.keys(records).length,
            }),
            targetUid: selectedClassId,
            targetName: selectedClassName,
            performedBy: user.uid,
            performedByName: actorName(displayName, user.email, staffFallback(role)),
          }),
        );
      }
      await batch.commit();

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
    const emptyCount = enrolledStudents.filter((s) => !effectiveRecord(dateISO, s.uid)).length;

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

  const isReadOnly = !effectiveTerm || weekDates[0] > termEnd || weekDates[6] < termStart;

  const sessionDates = selectedSubject && effectiveYear
    ? weekDates.filter((d) =>
        isSubjectSessionDay(d, selectedSubject, termStart, effectiveYear.schoolWeekDays, effectiveNonSchoolDays)
      )
    : [];

  const hasNoSchedule = !!selectedSubject && !selectedSubject.frequency;

  // Custom mode: further scoped to the selected time block, since a
  // subject's own classIds/classScope aren't themselves time-block-aware,
  // but every class carries its own termId (§3.2).
  const classesForDropdown = (
    selectedSubject?.classScope === 'institution'
      ? allClasses
      : allClasses.filter((c) => selectedSubject?.classIds.includes(c.id) ?? false)
  ).filter((c) => !isCustomMode || !selectedBlock || c.termId === selectedBlock.term.id);

  const showClassSelector =
    !!selectedSubject &&
    (selectedSubject.classScope === 'institution' || selectedSubject.classIds.length > 1);

  // ── Render ──
  if (USE_MOCK) return <InfoState message="Subject Attendance Register is not available in demo mode." />;
  if (calTimedOut) return <InfoState message="Something went wrong. Please contact your administrator." />;
  if (calLoading) return <Spinner />;
  if (!effectiveYear || !effectiveTerm) {
    return (
      <InfoState
        message={
          isCustomMode
            ? 'No active time block is configured. Set up a Time Block first.'
            : 'No active academic term is configured. Set up the Academic Calendar first.'
        }
      />
    );
  }

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
          {/* Time Block selector (§3.2, custom-mode only) — scopes classesForDropdown */}
          {isCustomMode && (
            <select
              value={selectedBlock?.term.id ?? ''}
              onChange={(e) => setSelectedBlockTermId(e.target.value)}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
            >
              {activeTimeBlocks.map((b) => (
                <option key={b.term.id} value={b.term.id}>{b.year.name}</option>
              ))}
            </select>
          )}

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
                        {!isReadOnly && dateISO <= today && (
                          <div className="mt-1">
                            <FillColumnButton
                              open={fillPickerDate === dateISO}
                              onToggle={() => setFillPickerDate((prev) => (prev === dateISO ? null : dateISO))}
                              onPick={(state) => handleFillPick(dateISO, state)}
                              onClose={() => setFillPickerDate(null)}
                              description={`cells for ${formatDateLabel(dateISO)}`}
                            />
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
                                  className={`inline-flex items-center justify-center w-8 h-8 rounded text-xs font-bold ${STATE_CLASS[displayState]}`}
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
                  if (!hasDraft && !saving) return null;
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

          {/* Status messages — below save controls */}
          {saveSuccess && (
            <div className="mt-3 rounded-md bg-green-50 dark:bg-green-950/40 px-3 py-2 text-sm text-green-700 dark:text-green-300">
              {saveSuccess}
            </div>
          )}
          {saveError && (
            <div className="mt-3 rounded-md bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
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
        </>
      )}

      <FillConfirmDialog
        pending={
          fillConfirm
            ? {
                description: formatDateLabel(fillConfirm.dateISO),
                state: fillConfirm.state,
                emptyCount: fillConfirm.emptyCount,
              }
            : null
        }
        onCancel={() => setFillConfirm(null)}
        onConfirm={commitFill}
      />

      {/* Confirm dialog */}
      {confirmDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Confirm Save</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              Some students still have no attendance state. They will not be counted in any attendance total. Save anyway?
            </p>
            <MissingStudentsList
              groups={missingBySession(enrolledStudents, [
                {
                  label: formatDateLabel(activeSaveDate),
                  hasRecord: (uid) => !!effectiveRecord(activeSaveDate, uid),
                },
              ])}
            />
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
