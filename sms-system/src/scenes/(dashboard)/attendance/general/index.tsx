import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { USE_MOCK } from '@/lib/data';
import { useGeneralAttendanceScope } from '@/hooks/useGeneralAttendanceScope';
import { useGeneralRegisterReads } from '@/hooks/useGeneralRegisterReads';
import FillConfirmDialog from '@/components/attendance/FillConfirmDialog';
import { fillCounts, missingBySession, studentsToFill, type FillMode, type SessionMissing } from '@/lib/attendanceMissing';
import { type AttendanceState } from '@/lib/attendanceStates';
import {
  getDraft,
  setDraftCell,
  clearDraft,
  purgeExpiredDrafts,
  DraftRecord,
} from '@/lib/attendanceDraft';
import { isSchoolDay } from '@/lib/attendanceCalendar';
import { AttendanceScopeModal } from '@/components/attendance/AttendanceScopeModal';
import { logSaveAllAudit, rebuildSummaries, writeRegisterDoc } from '@/lib/generalAttendanceSave';
import { canWrite } from '@/lib/roleCapabilities';
import { RegisterGrid } from './RegisterGrid';
import { RegisterHeader } from './RegisterHeader';
import { CopyNotice, InfoState, Spinner } from '@/components/attendance/RegisterNotices';
import { SaveControls } from './SaveControls';
import { SaveDialogs } from './SaveDialogs';
import { WeekNavigator } from './WeekNavigator';
import {
  addDays,
  buildRegisterRecords,
  effectiveRecordOf,
  formatDateLabel,
  getWeekStart,
  isCellDisabledOn,
  isOverdueSession,
  populatedSessionsOf,
  toISO,
  type DraftKey,
  type DraftStore,
  type Session,
} from '@/lib/generalAttendanceLogic';

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function GeneralAttendanceRegisterPage() {
  const { user, role, institutionId, displayName } = useAuth();
  const {
    isCustomMode,
    activeTimeBlocks,
    selectedBlock,
    setSelectedBlockTermId,
    resolvedBlock,
    scopedClasses,
    selectedClassId,
    setSelectedClassId,
    assignedClassId,
    effectiveYear,
    effectiveTerm,
    effectiveNonSchoolDays,
    effectiveClassId,
    effectiveClassName,
    calLoading,
    calTimedOut,
    profileLoading,
  } = useGeneralAttendanceScope();

  // Week navigation
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart(new Date()));
  const today = toISO(new Date());

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

  // The class's students and this week's saved registers (from working copies when offline)
  const { students, studentsLoading, savedDocs, copySavedAt } = useGeneralRegisterReads(institutionId, effectiveClassId, weekDates[0], weekEnd);

  // ── Purge expired drafts on mount ──
  useEffect(() => {
    if (termStart) purgeExpiredDrafts(termStart);
  }, [termStart]);

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
    ): { state: AttendanceState; reason?: string } | undefined =>
      effectiveRecordOf(draft, savedDocs, dateISO, session, studentUid),
    [draft, savedDocs],
  );

  // Auto-fill (from the dev-notes plan, not kept in the repository). fillPickerKey tracks
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
    markedCount: number;
    excusedCount: number;
  } | null>(null);

  // The dialog always opens, with how many are empty and how many are marked with another state, so a column
  // that was filled before can be overwritten instead of the button doing nothing.
  function handleFillPick(dateISO: string, session: Session, state: AttendanceState) {
    setFillPickerKey(null);
    if (students.length === 0) return;
    const counts = fillCounts(students, (uid) => effectiveRecord(dateISO, session, uid)?.state, state);
    setFillConfirm({ dateISO, session, state, ...counts });
  }

  // Routes through the exact same handleCellChange every manual click uses —
  // Save/Save All/the incomplete-attendance warning all keep working
  // unmodified, since a filled cell is indistinguishable from a hand-clicked
  // one once it's in the draft. 'empty' leaves anyone already marked alone;
  // 'all' overwrites the column. Nobody already marked with the state changes.
  function commitFill(mode: FillMode) {
    if (!fillConfirm) return;
    const { dateISO, session, state } = fillConfirm;
    for (const student of studentsToFill(students, (uid) => effectiveRecord(dateISO, session, uid)?.state, mode, state)) {
      handleCellChange(dateISO, session, student.uid, state);
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

    const records = buildRegisterRecords(students, (uid) => effectiveRecord(dateISO, session, uid));

    // The register and its audit entry in ONE batch, so a register is never saved unrecorded. A Save All
    // passes withAudit=false and logs one summary entry for all its registers afterwards (logSaveAllAudit).
    await writeRegisterDoc({
      institutionId,
      classId: effectiveClassId,
      className: effectiveClassName,
      termId: effectiveTerm.id,
      academicYearId: effectiveYear.id,
      dateISO,
      session,
      records,
      existingDoc,
      actor: { uid: user.uid, email: user.email, displayName, role },
      withAudit,
    });

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
    void rebuildSummaries({
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
      await logSaveAllAudit({
        institutionId,
        classId: effectiveClassId,
        className: effectiveClassName,
        sessions,
        actor: { uid: user.uid, email: user.email, displayName, role },
      });
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
    return isOverdueSession(dateISO, session, today, savedDocs);
  }

  // ── Cell disabled logic ──
  function isCellDisabled(dateISO: string): boolean {
    return isCellDisabledOn(dateISO, today, effectiveYear, effectiveNonSchoolDays);
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
  // isReadOnly means "this week is outside the term" (and drives the notice above
  // the grid). viewOnly also covers a role that may not write at all (a spectator),
  // which sees the saved registers with no cell buttons, fill, or save controls.
  const viewOnly = isReadOnly || !canWrite(role);

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
  const populatedSessions = useMemo(
    () => populatedSessionsOf(schoolDays, students, sessionHasDraft, effectiveRecord),
    [schoolDays, students, sessionHasDraft, effectiveRecord],
  );

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
      <RegisterHeader
        effectiveClassName={effectiveClassName}
        students={students}
        isCustomMode={isCustomMode}
        role={role}
        resolvedBlock={resolvedBlock}
        setExportModalOpen={setExportModalOpen}
        selectedBlock={selectedBlock}
        setSelectedBlockTermId={setSelectedBlockTermId}
        activeTimeBlocks={activeTimeBlocks}
        selectedClassId={selectedClassId}
        setSelectedClassId={setSelectedClassId}
        scopedClasses={scopedClasses}
      />

      <CopyNotice savedAt={copySavedAt} />

      <WeekNavigator
        prevWeek={prevWeek}
        nextWeek={nextWeek}
        canGoBack={canGoBack}
        canGoNext={canGoNext}
        weekDates={weekDates}
        isReadOnly={isReadOnly}
      />

      <RegisterGrid
        effectiveClassId={effectiveClassId}
        students={students}
        studentsLoading={studentsLoading}
        weekDates={weekDates}
        effectiveYear={effectiveYear}
        effectiveNonSchoolDays={effectiveNonSchoolDays}
        viewOnly={viewOnly}
        isCellDisabled={isCellDisabled}
        isOverdue={isOverdue}
        fillPickerKey={fillPickerKey}
        setFillPickerKey={setFillPickerKey}
        handleFillPick={handleFillPick}
        draft={draft}
        savedDocs={savedDocs}
        saveAttempted={saveAttempted}
        handleCellChange={handleCellChange}
        excusedPopover={excusedPopover}
        setExcusedPopover={setExcusedPopover}
        handleReasonChange={handleReasonChange}
      />

      <SaveControls
        viewOnly={viewOnly}
        effectiveClassId={effectiveClassId}
        students={students}
        populatedSessions={populatedSessions}
        handleSaveAll={handleSaveAll}
        savingAll={savingAll}
        savingKey={savingKey}
        schoolDays={schoolDays}
        sessionHasDraft={sessionHasDraft}
        savedDocs={savedDocs}
        handleSave={handleSave}
        saveSuccess={saveSuccess}
        saveError={saveError}
        saveAttempted={saveAttempted}
        setConfirmDialogOpen={setConfirmDialogOpen}
        summaryWarning={summaryWarning}
        setSummaryWarning={setSummaryWarning}
      />

      {/* PDF export scope modal */}
      <AttendanceScopeModal
        open={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        defaultClassId={effectiveClassId || undefined}
      />

      <SaveDialogs
        confirmDialogOpen={confirmDialogOpen}
        setConfirmDialogOpen={setConfirmDialogOpen}
        setSaveAttempted={setSaveAttempted}
        setSaveError={setSaveError}
        commitSave={commitSave}
        activeDate={activeDate}
        activeSession={activeSession}
        students={students}
        effectiveRecord={effectiveRecord}
        saveAllConfirmOpen={saveAllConfirmOpen}
        setSaveAllConfirmOpen={setSaveAllConfirmOpen}
        saveAllMissing={saveAllMissing}
        setSaveAllMissing={setSaveAllMissing}
        saveAllPending={saveAllPending}
        setSaveAllPending={setSaveAllPending}
        commitSaveAll={commitSaveAll}
      />

      {/* Auto-fill confirm dialog (§3.2) — "Fill N" touches only the cells
          that are empty when it is confirmed; "Overwrite all" replaces every
          mark in the column. */}
      <FillConfirmDialog
        pending={
          fillConfirm
            ? {
                description: `the ${fillConfirm.session} register for ${formatDateLabel(fillConfirm.dateISO)}`,
                state: fillConfirm.state,
                emptyCount: fillConfirm.emptyCount,
                markedCount: fillConfirm.markedCount,
                excusedCount: fillConfirm.excusedCount,
              }
            : null
        }
        onCancel={() => setFillConfirm(null)}
        onConfirm={commitFill}
      />
    </div>
  );
}
