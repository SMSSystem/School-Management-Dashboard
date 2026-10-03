import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, GeneralAttendanceDocument } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { actorName, buildAuditEntry, logAuditEvent, staffFallback } from '@/lib/auditLog';
import { generalAttendanceAllDetail, generalAttendanceDetail } from '@/lib/teacherAudit';
import { institutionCollection, institutionDoc } from '@/lib/paths';
import { USE_MOCK } from '@/lib/data';
import { useInstitutionAcademicCalendar } from '@/hooks/useInstitutionAcademicCalendar';
import { useSeniorTeacherProfile } from '@/hooks/useSeniorTeacherProfile';
import { useInstitutionClasses } from '@/hooks/useInstitutionClasses';
import { byName } from '@/lib/sortByName';
import FillColumnButton from '@/components/attendance/FillColumnButton';
import FillConfirmDialog from '@/components/attendance/FillConfirmDialog';
import MissingStudentsList from '@/components/attendance/MissingStudentsList';
import { missingBySession, type SessionMissing } from '@/lib/attendanceMissing';
import { AttendanceStateButton, STATE_CLASS } from '@/components/attendance/AttendanceStateButton';
import { type AttendanceState } from '@/lib/attendanceStates';
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
import { getPersistedFilter, setPersistedFilter } from '@/lib/filterPersistence';

const FILTER_PAGE = 'general_attendance';

// ─── Types ────────────────────────────────────────────────────────────────────

type Session = 'AM' | 'PM';

interface StudentRow {
  uid: string;
  name: string;
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
  const { user, role, institutionId, institution, displayName } = useAuth();
  const {
    activeYear, activeTerm, nonSchoolDays,
    activeTimeBlocks, nonSchoolDaysByTermId,
    loading: calLoading, timedOut: calTimedOut,
  } = useInstitutionAcademicCalendar();
  const { assignedClassId, assignedClassName, loading: profileLoading } = useSeniorTeacherProfile();
  const isCustomMode = institution?.calendarMode === 'custom';

  // Class selector (admin/super_admin) — initial value restored from the last
  // selection made this session (cleared on logout), per DEV_NOTES Item 6.1.
  const { data: classes = [] } = useInstitutionClasses();

  // ── Time Block selector (§3.2, custom-mode admin/super_admin path only) ──
  // A senior_teacher's assigned class already ties them to exactly one time
  // block via the class's own termId — no picker needed for that role; see
  // resolvedBlock below. For admin/super_admin, this scopes which classes the
  // class selector below even shows, since classes across concurrently active
  // time blocks would otherwise be shown all mixed together.
  const [selectedBlockTermId, setSelectedBlockTermId] = useState<string>(() => getPersistedFilter(FILTER_PAGE, 'selectedBlockTermId'));
  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, 'selectedBlockTermId', selectedBlockTermId);
  }, [selectedBlockTermId]);
  // Falls back to activeTimeBlocks[0] (the confirmed default-selection rule,
  // §3 — the hook already returns this list pre-sorted) rather than a
  // separate "default it" effect, so there's no render where a valid block
  // list exists but nothing is selected yet.
  const persistedBlockValid = activeTimeBlocks.some((b) => b.term.id === selectedBlockTermId);
  const selectedBlock = persistedBlockValid
    ? activeTimeBlocks.find((b) => b.term.id === selectedBlockTermId)!
    : activeTimeBlocks[0] ?? null;

  const scopedClasses = isCustomMode && role !== 'senior_teacher'
    ? classes.filter((c) => c.termId === selectedBlock?.term.id)
    : classes;

  const [selectedClassId, setSelectedClassId] = useState<string>(() => getPersistedFilter(FILTER_PAGE, 'selectedClassId'));
  const selectedClass = scopedClasses.find((c) => c.id === selectedClassId);

  useEffect(() => {
    setPersistedFilter(FILTER_PAGE, 'selectedClassId', selectedClassId);
  }, [selectedClassId]);

  // Drop a restored classId once classes have loaded and it's no longer valid
  // (e.g. the class was deleted since the last session, or — custom mode —
  // it belongs to a different time block than the one now selected above).
  useEffect(() => {
    if (selectedClassId && scopedClasses.length > 0 && !scopedClasses.some((c) => c.id === selectedClassId)) {
      setSelectedClassId('');
    }
  }, [selectedClassId, scopedClasses]);

  // A senior_teacher's own time block, resolved from their assigned class's
  // termId rather than any picker — always exactly one, unambiguous.
  const assignedClassDoc = role === 'senior_teacher' ? classes.find((c) => c.id === assignedClassId) : undefined;
  const resolvedBlock = !isCustomMode
    ? null
    : role === 'senior_teacher'
    ? activeTimeBlocks.find((b) => b.term.id === assignedClassDoc?.termId) ?? null
    : selectedBlock;

  const effectiveYear = isCustomMode ? resolvedBlock?.year ?? null : activeYear;
  const effectiveTerm = isCustomMode ? resolvedBlock?.term ?? null : activeTerm;
  // Memoized (not a bare fallback-to-[] expression) so its identity is stable
  // whenever the underlying data doesn't change — otherwise the `[]` fallback
  // below would be a fresh array every render, and schoolDays' own useMemo
  // (keyed on this) would never actually memoize anything for custom mode.
  const effectiveNonSchoolDays = useMemo(
    () => (isCustomMode ? (effectiveTerm ? nonSchoolDaysByTermId[effectiveTerm.id] ?? [] : []) : nonSchoolDays),
    [isCustomMode, effectiveTerm, nonSchoolDaysByTermId, nonSchoolDays],
  );

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
  const [summaryWarning, setSummaryWarning] = useState<string | null>(null);

  // Save All flow (Item 7.2) — batch-commits every populated session in the
  // visible week at once, warning about (but not force-saving) any session
  // that's only partially filled in.
  const [savingAll, setSavingAll] = useState(false);
  const [saveAllConfirmOpen, setSaveAllConfirmOpen] = useState(false);
  const [saveAllPending, setSaveAllPending] = useState<{ dateISO: string; session: Session }[]>([]);
  // Which students are unmarked in each incomplete session, by name — what the
  // Save All dialog lists (not just which sessions).
  const [saveAllMissing, setSaveAllMissing] = useState<SessionMissing[]>([]);

  // PDF export modal
  const [exportModalOpen, setExportModalOpen] = useState(false);

  // Excused reason popover: keyed by `${studentId}_${dateISO}_${session}`
  const [excusedPopover, setExcusedPopover] = useState<string | null>(null);

  // Which session the save buttons belong to
  const [activeSession, setActiveSession] = useState<Session>('AM');
  const [activeDate, setActiveDate] = useState<string>(today);

  const weekDates = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)));
  const termStart = effectiveTerm?.startDate ?? '';
  const termEnd   = effectiveTerm?.endDate   ?? '';
  const weekEnd   = weekDates[6];

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
      }));
      rows.sort(byName((s: StudentRow) => s.name));
      setStudents(rows);
    });
  }, [effectiveClassId, institutionId]);

  // ── Live query for saved documents in the current week ──
  useEffect(() => {
    if (!effectiveClassId || !institutionId) return;
    const unsub = onSnapshot(
      query(
        institutionCollection(institutionId, 'generalAttendance'),
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
    const existing = draft[key]?.[studentId];
    const record: DraftRecord = { state, reason: state === 'E' ? (existing?.reason ?? '') : undefined };

    // Merges into prev[key], not a `current` read from the outer closure —
    // deliberately, so this stays correct when called repeatedly against the
    // same key within one synchronous pass (commitFill's auto-fill loop,
    // §3.2). setDraftState's functional updater sees each prior queued
    // update's result via `prev`; a closure-captured snapshot doesn't, and
    // would silently overwrite earlier calls in the same loop with only the
    // last one. setDraftCell's own localStorage write is unaffected either
    // way — getDraft() re-reads synchronously on every call.
    setDraftState((prev) => ({ ...prev, [key]: { ...prev[key], [studentId]: record } }));
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
    const record: DraftRecord = { state: 'E', reason };
    // Same prev[key]-based merge as handleCellChange, for the same reason.
    setDraftState((prev) => ({ ...prev, [key]: { ...prev[key], [studentId]: record } }));
    setDraftCell(institutionId, effectiveClassId, dateISO, session, studentId, record);
  }

  // Effective per-student state for a (date, session): the in-memory draft
  // entry if one exists, else whatever's already saved for that student.
  // Needed because writeSessionDoc's own clearDraft() (below) removes a
  // session's draft on save, and the only place local `draft` state
  // re-syncs from localStorage is a separate effect gated on class/week
  // changes — so a page remount followed by a single-cell edit leaves
  // `draft[key]` holding just that one student, making every OTHER already-
  // saved student look unmarked to both the incomplete-save warning and,
  // more seriously, to what a non-merge setDoc actually writes.
  // useCallback (keyed on draft/savedDocs), same reason as sessionHasDraft
  // below: keeps its identity stable so it can be safely used inside
  // populatedSessions' own useMemo.
  const effectiveRecord = useCallback(
    (
      dateISO: string,
      session: Session,
      studentUid: string,
    ): { state: AttendanceState; reason?: string } | undefined => {
      const key: DraftKey = `${dateISO}_${session}`;
      const draftRecord = draft[key]?.[studentUid];
      if (draftRecord) return draftRecord;
      const saved = savedDocs.find((d) => d.date === dateISO && d.session === session)?.records[studentUid];
      return saved ? { state: saved.state, reason: saved.reason } : undefined;
    },
    [draft, savedDocs],
  );

  // Auto-fill (DEV_NOTES_IMPLEMENTATION_PLAN.md §3.2). fillPickerKey tracks
  // which single column's FillStatePicker is open (only one at a time —
  // clicking a different column's fill icon naturally closes any other,
  // since this is one piece of state, not per-column). fillConfirm holds the
  // pending action between picking a state and confirming it.
  const [fillPickerKey, setFillPickerKey] = useState<DraftKey | null>(null);
  const [fillConfirm, setFillConfirm] = useState<{
    dateISO: string;
    session: Session;
    state: AttendanceState;
    emptyCount: number;
  } | null>(null);

  function handleFillPick(dateISO: string, session: Session, state: AttendanceState) {
    setFillPickerKey(null);
    const emptyCount = students.filter((s) => !effectiveRecord(dateISO, session, s.uid)).length;
    if (emptyCount === 0) return; // every student already has a state — nothing to fill
    setFillConfirm({ dateISO, session, state, emptyCount });
  }

  // Routes through the exact same handleCellChange every manual click uses —
  // Save/Save All/the incomplete-attendance warning all keep working
  // unmodified, since a filled cell is indistinguishable from a hand-clicked
  // one once it's in the draft.
  function commitFill() {
    if (!fillConfirm) return;
    const { dateISO, session, state } = fillConfirm;
    for (const student of students) {
      if (!effectiveRecord(dateISO, session, student.uid)) {
        handleCellChange(dateISO, session, student.uid, state);
      }
    }
    setFillConfirm(null);
  }

  // ── Save flow ──

  /** Writes one session's Firestore doc and clears its draft. No rebuild, no
   * saveSuccess/saveError side effects — those are caller-specific (a single
   * save vs. Save All want different messaging), and triggering a rebuild per
   * session would mean N redundant/racy concurrent rebuilds when Save All
   * commits several sessions in the same class at once. */
  async function writeSessionDoc(dateISO: string, session: Session, withAudit = true) {
    if (!user || !effectiveClassId || !institutionId || !effectiveTerm || !effectiveYear) return;
    const key: DraftKey = `${dateISO}_${session}`;

    const existingDoc = savedDocs.find((d) => d.date === dateISO && d.session === session);
    const docRef = existingDoc
      ? institutionDoc(institutionId, 'generalAttendance', existingDoc.id)
      : doc(institutionCollection(institutionId, 'generalAttendance'));

    const records: GeneralAttendanceDocument['records'] = {};
    for (const student of students) {
      const r = effectiveRecord(dateISO, session, student.uid);
      if (r) {
        records[student.uid] = {
          state: r.state,
          studentName: student.name,
          ...(r.reason ? { reason: r.reason } : {}),
        };
      }
    }

    // The register and its audit entry in ONE batch, so a register is never saved
    // unrecorded. A Save All passes withAudit=false and logs one summary entry
    // for all its registers afterwards (logSaveAllAudit).
    const batch = writeBatch(db);
    batch.set(docRef, {
      institutionId,
      classId: effectiveClassId,
      className: effectiveClassName,
      termId: effectiveTerm.id,
      academicYearId: effectiveYear.id,
      date: dateISO,
      session,
      records,
      submittedBy: user.uid,
      submittedAt: serverTimestamp(),
      createdAt: existingDoc ? (existingDoc.createdAt as unknown) : serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    if (withAudit && institutionId !== '*') {
      batch.set(
        doc(institutionCollection(institutionId, 'audit_log')),
        buildAuditEntry({
          institutionId,
          eventType: 'attendance_edit',
          detail: generalAttendanceDetail({
            className: effectiveClassName,
            dateISO,
            session,
            recorded: Object.keys(records).length,
          }),
          targetUid: effectiveClassId,
          targetName: effectiveClassName,
          performedBy: user.uid,
          performedByName: actorName(displayName, user.email, staffFallback(role)),
        }),
      );
    }
    await batch.commit();

    clearDraft(institutionId, effectiveClassId, dateISO, session);
    // clearDraft only removes the localStorage copy — the button's hasDraft
    // check reads from local `draft` state, which has no other subscriber
    // that would pick up this change until the next class/week switch.
    setDraftState((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  /** Background summary upsert — does not block save feedback. Shared by both
   * the single-session and Save All flows; callers trigger it once, after
   * every write they're responsible for has completed. */
  function triggerSummaryRebuild() {
    if (!effectiveClassId || !institutionId || !effectiveTerm || !effectiveYear) return;
    void rebuildSummariesForClass({
      classId: effectiveClassId,
      termId: effectiveTerm.id,
      academicYearId: effectiveYear.id,
      institutionId,
      termStartDate: effectiveTerm.startDate,
      termEndDate: effectiveTerm.endDate,
      schoolWeekDays: effectiveYear.schoolWeekDays,
      nonSchoolDays: effectiveNonSchoolDays,
    }).catch((err) => {
      console.error('Attendance summary rebuild failed:', err);
      setSummaryWarning(
        'Register saved, but the attendance summary could not be updated. ' +
        'Report card attendance data may be stale — run "Rebuild Summaries" from the admin menu.',
      );
    });
  }

  async function commitSave(dateISO: string, session: Session) {
    if (!user || !effectiveClassId || !institutionId || !effectiveTerm || !effectiveYear) return;
    const key: DraftKey = `${dateISO}_${session}`;

    setSavingKey(key);
    setSaveError(null);

    try {
      await writeSessionDoc(dateISO, session);
      setSaveAttempted(false);
      setSaveSuccess(`${session} register for ${formatDateLabel(dateISO)} saved.`);
      setTimeout(() => setSaveSuccess(null), 3000);
      triggerSummaryRebuild();
    } catch {
      setSaveError('Save failed. Check your connection and try again.');
    } finally {
      setSavingKey(null);
    }
  }

  /** Save All: commits every session in the visible week that has at least
   * one student marked. `sessions` is the exact list decided at the moment
   * Save All was clicked (or confirmed past the incomplete-sessions warning),
   * not recomputed at commit time. */
  async function commitSaveAll(sessions: { dateISO: string; session: Session }[]) {
    if (!user || !effectiveClassId || !institutionId || !effectiveTerm || !effectiveYear || sessions.length === 0) return;
    setSavingAll(true);
    setSaveError(null);
    try {
      // Safe to parallelize: writeSessionDoc only touches its own
      // (dateISO, session) doc and its own draft key, triggers no summary
      // rebuild itself (see its own doc comment), and doesn't read/write any
      // state shared across sessions.
      await Promise.all(sessions.map(({ dateISO, session }) => writeSessionDoc(dateISO, session, false)));
      // One summary entry for the whole Save All. Best-effort and after the
      // registers (it cannot share their separate batches): a failed log write
      // never turns a successful save into an error.
      if (institutionId !== '*') {
        try {
          await logAuditEvent({
            institutionId,
            eventType: 'attendance_edit',
            detail: generalAttendanceAllDetail({ className: effectiveClassName, sessions }),
            targetUid: effectiveClassId,
            targetName: effectiveClassName,
            performedBy: user.uid,
            performedByName: actorName(displayName, user.email, staffFallback(role)),
          });
        } catch {
          // Best-effort.
        }
      }
      setSaveSuccess(`${sessions.length} session${sessions.length === 1 ? '' : 's'} saved.`);
      setTimeout(() => setSaveSuccess(null), 3000);
      triggerSummaryRebuild();
    } catch {
      setSaveError(
        'Save All failed partway through — check your connection. Sessions already saved are marked ✓; ' +
        'retry the rest individually or click Save All again.',
      );
    } finally {
      setSavingAll(false);
    }
  }

  function handleSaveAll(populated: { dateISO: string; session: Session; emptyCount: number }[]) {
    if (populated.length === 0) return;
    const incomplete = populated.filter((s) => s.emptyCount > 0);
    if (incomplete.length > 0) {
      setSaveAllPending(populated.map(({ dateISO, session }) => ({ dateISO, session })));
      setSaveAllMissing(
        missingBySession(
          students,
          incomplete.map((s) => ({
            label: `${s.session} ${formatDateLabel(s.dateISO)}`,
            hasRecord: (uid: string) => !!effectiveRecord(s.dateISO, s.session, uid),
          })),
        ),
      );
      setSaveAllConfirmOpen(true);
      return;
    }
    void commitSaveAll(populated);
  }

  function handleSave(dateISO: string, session: Session) {
    const emptyCount = students.filter((s) => !effectiveRecord(dateISO, session, s.uid)).length;

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
    if (!effectiveYear) return true;
    return !isSchoolDay(dateISO, effectiveYear.schoolWeekDays, effectiveNonSchoolDays);
  }

  // Shared by populatedSessions and the per-session Save buttons below, so
  // the "does this session have unsaved draft data" check only lives once.
  // useCallback (keyed only on draft) keeps its identity stable so it can be
  // safely used inside populatedSessions' own useMemo below.
  const sessionHasDraft = useCallback(
    (key: DraftKey): boolean => Object.keys(draft[key] ?? {}).length > 0,
    [draft],
  );

  // ── Read-only mode: outside current term ──
  const isReadOnly = !effectiveTerm || weekDates[0] > termEnd || weekDates[6] < termStart;

  // School days for the visible week. Memoized on weekStart (a stable state
  // value) rather than the ever-fresh weekDates array, so this is
  // referentially stable across renders that don't actually change the week
  // or calendar data — declared here (a hook) rather than after the early
  // returns below, since hooks must run unconditionally every render.
  const schoolDays = useMemo(() => {
    const dates = Array.from({ length: 7 }, (_, i) => toISO(addDays(weekStart, i)));
    return dates.filter((d) => effectiveYear && isSchoolDay(d, effectiveYear.schoolWeekDays, effectiveNonSchoolDays));
  }, [weekStart, effectiveYear, effectiveNonSchoolDays]);

  // Every school-day×session this week with at least one student marked —
  // the same set that already gets its own individual Save button below.
  // Memoized since schoolDays/draft/students only change on real edits, not
  // on every render (e.g. a popover or dialog opening/closing).
  const populatedSessions = useMemo(() => schoolDays.flatMap((dateISO) =>
    (['AM', 'PM'] as Session[])
      .map((session) => {
        const key: DraftKey = `${dateISO}_${session}`;
        if (!sessionHasDraft(key)) return null;
        // effectiveRecord (not currentDraft alone) — a session with even one
        // post-remount draft entry would otherwise report every other
        // already-saved student as unmarked here too, the same false-warning
        // bug as handleSave/writeSessionDoc above (DEV_NOTES_IMPLEMENTATION_
        // PLAN.md §1.3), just surfacing via the Save All confirmation dialog
        // instead of the single-session one.
        const emptyCount = students.filter((s) => !effectiveRecord(dateISO, session, s.uid)).length;
        return { dateISO, session, emptyCount };
      })
      .filter((s): s is { dateISO: string; session: Session; emptyCount: number } => s !== null),
  ), [schoolDays, students, sessionHasDraft, effectiveRecord]);

  // ── Render ──
  if (USE_MOCK) return <InfoState message="General Attendance Register is not available in demo mode." />;
  if (calTimedOut) return <InfoState message="Something went wrong. Please contact your administrator." />;
  if (calLoading || profileLoading) return <Spinner />;
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
  if (role === 'senior_teacher' && !assignedClassId) return <InfoState message="You have no homeroom class assigned. Please contact your institution's administrator." />;

  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">General Attendance Register</h1>
          {effectiveClassName && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
              {effectiveClassName} ({students.length})
            </p>
          )}
          {isCustomMode && role === 'senior_teacher' && resolvedBlock && (
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{resolvedBlock.year.name}</p>
          )}
        </div>

        <button
          type="button"
          onClick={() => setExportModalOpen(true)}
          className="text-sm font-medium text-sky-600 dark:text-sky-400 hover:underline"
        >
          Export PDF
        </button>

        {/* Time Block selector (§3.2, custom-mode admin/super_admin path only) — scopes the class selector below */}
        {isCustomMode && role !== 'senior_teacher' && (
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

        {/* Class selector for admin/super_admin */}
        {role !== 'senior_teacher' && (
          <select
            value={selectedClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-sky-400 dark:border-gray-700 dark:bg-gray-900 dark:text-gray-100"
          >
            <option value="">Select a class…</option>
            {scopedClasses.map((c) => (
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
                  const isSD = effectiveYear && isSchoolDay(dateISO, effectiveYear.schoolWeekDays, effectiveNonSchoolDays);
                  const columnDisabled = isReadOnly || isCellDisabled(dateISO);
                  return (
                    <th
                      key={dateISO}
                      colSpan={2}
                      className={`px-2 py-2 text-center font-medium text-xs ${isSD ? 'text-gray-700 dark:text-gray-200' : 'text-gray-400 dark:text-gray-600'}`}
                    >
                      <div>{formatDayLabel(dateISO)}</div>
                      <div className="font-normal">{formatDateLabel(dateISO)}</div>
                      <div className="flex gap-1.5 justify-center mt-1">
                        {(['AM', 'PM'] as Session[]).map((s) => {
                          const fillKey: DraftKey = `${dateISO}_${s}`;
                          return (
                            <div key={s} className="relative flex items-center gap-0.5">
                              <span
                                className={`text-[10px] px-1 rounded ${
                                  isOverdue(dateISO, s)
                                    ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'
                                    : 'text-gray-400 dark:text-gray-500'
                                }`}
                              >
                                {s}
                              </span>
                              {!columnDisabled && (
                                <FillColumnButton
                                  open={fillPickerKey === fillKey}
                                  onToggle={() => setFillPickerKey((prev) => (prev === fillKey ? null : fillKey))}
                                  onPick={(state) => handleFillPick(dateISO, s, state)}
                                  onClose={() => setFillPickerKey(null)}
                                  description={`${s} cells for ${formatDateLabel(dateISO)}`}
                                />
                              )}
                            </div>
                          );
                        })}
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

      {/* Save All — only worth showing once there's more than one session to batch */}
      {!isReadOnly && effectiveClassId && students.length > 0 && populatedSessions.length > 1 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => handleSaveAll(populatedSessions)}
            disabled={savingAll || savingKey !== null}
            className="text-xs font-semibold rounded-md px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {savingAll ? 'Saving All…' : `Save All (${populatedSessions.length})`}
          </button>
        </div>
      )}

      {/* Save controls — one per school day × session */}
      {!isReadOnly && effectiveClassId && students.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {schoolDays.flatMap((dateISO) =>
            (['AM', 'PM'] as Session[]).map((session) => {
              const key: DraftKey = `${dateISO}_${session}`;
              const hasDraft = sessionHasDraft(key);
              const isSaved = savedDocs.some((d) => d.date === dateISO && d.session === session && d.submittedAt);
              const saving = savingKey === key;
              if (!hasDraft && !saving) return null;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleSave(dateISO, session)}
                  disabled={saving || savingAll || (!hasDraft && isSaved)}
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
      {summaryWarning && (
        <div className="mt-3 rounded-md bg-orange-50 dark:bg-orange-950/40 px-3 py-2 text-sm text-orange-700 dark:text-orange-300 flex items-start justify-between gap-3">
          <span>{summaryWarning}</span>
          <button
            type="button"
            className="shrink-0 underline font-medium"
            onClick={() => setSummaryWarning(null)}
          >
            Dismiss
          </button>
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
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              Some students still have no attendance state. They will not be counted in any attendance total. Save anyway?
            </p>
            <MissingStudentsList
              groups={missingBySession(students, [
                {
                  label: `${activeSession} ${formatDateLabel(activeDate)}`,
                  hasRecord: (uid) => !!effectiveRecord(activeDate, activeSession, uid),
                },
              ])}
            />
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

      {/* Save All confirm dialog — lists every partially-filled session, distinct
          from the single-session dialog above (which only ever covers one). */}
      {saveAllConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-gray-900 rounded-lg border border-gray-200 dark:border-gray-700 p-6 max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Confirm Save All</h3>
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-2">
              {saveAllMissing.length} session{saveAllMissing.length === 1 ? '' : 's'} still have
              some students with no attendance state — these students won&apos;t be counted in any attendance total:
            </p>
            <MissingStudentsList groups={saveAllMissing} />
            <p className="text-sm text-gray-600 dark:text-gray-300 mb-4">
              Save all {saveAllPending.length} populated session{saveAllPending.length === 1 ? '' : 's'} anyway?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => { setSaveAllConfirmOpen(false); setSaveAllPending([]); setSaveAllMissing([]); }}
                className="rounded-md border border-gray-300 dark:border-gray-700 px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => { setSaveAllConfirmOpen(false); void commitSaveAll(saveAllPending); }}
                className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
              >
                Save All Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Auto-fill confirm dialog (§3.2) — only ever touches cells that were
          empty at the moment fillConfirm was set; already-marked students
          are untouched regardless of whether they were marked before or
          after the fill button was clicked. */}
      <FillConfirmDialog
        pending={
          fillConfirm
            ? {
                description: `the ${fillConfirm.session} register for ${formatDateLabel(fillConfirm.dateISO)}`,
                state: fillConfirm.state,
                emptyCount: fillConfirm.emptyCount,
              }
            : null
        }
        onCancel={() => setFillConfirm(null)}
        onConfirm={commitFill}
      />
    </div>
  );
}
