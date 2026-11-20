import { useEffect, useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { actorName, staffFallback } from "@/lib/auditLog";
import { USE_MOCK } from "@/lib/data";
import {
  DraftRecord,
  purgeExpiredDrafts,
  getSubjectDraft,
  setSubjectDraftCell,
  clearSubjectDraft,
} from "@/lib/attendanceDraft";
import { canWrite } from "@/lib/roleCapabilities";
import type { AttendanceState } from "@/lib/attendanceStates";
import FillConfirmDialog from "@/components/attendance/FillConfirmDialog";
import {
  fillCounts,
  studentsToFill,
  type FillMode,
} from "@/lib/attendanceMissing";
import {
  addDays,
  formatDateLabel,
  getWeekStart,
  toISO,
} from "@/lib/generalAttendanceLogic";
import {
  buildSubjectRecords,
  effectiveRecordOf,
  sessionDatesOf,
} from "@/lib/subjectAttendanceLogic";
import { saveSubjectRegister } from "@/lib/subjectAttendanceSave";
import { useSubjectAttendanceScope } from "@/hooks/useSubjectAttendanceScope";
import { useSubjectRegisterReads } from "@/hooks/useSubjectRegisterReads";
import { CopyNotice, InfoState, Spinner } from "@/components/attendance/RegisterNotices";
import { RegisterHeader } from "./RegisterHeader";
import { WeekNavigator } from "./WeekNavigator";
import { RegisterGrid } from "./RegisterGrid";
import { SaveButtons } from "./SaveButtons";
import { SaveMessages } from "./SaveMessages";
import { ConfirmSaveDialog } from "./ConfirmSaveDialog";

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SubjectAttendancePage() {
  const { user, role, institutionId, displayName } = useAuth();
  const {
    isCustomMode,
    calLoading,
    calTimedOut,
    activeTimeBlocks,
    subjects,
    selectedSubjectId,
    setSelectedSubjectId,
    selectedSubject,
    selectedClassId,
    setSelectedClassId,
    selectedClassName,
    selectedBlock,
    setSelectedBlockTermId,
    effectiveYear,
    effectiveTerm,
    effectiveNonSchoolDays,
    classesForDropdown,
    showClassSelector,
  } = useSubjectAttendanceScope();

  // Week navigation
  const [weekStart, setWeekStart] = useState<Date>(getWeekStart(new Date()));
  const today = toISO(new Date());

  // Draft state: keyed by dateISO
  const [draft, setDraftState] = useState<
    Record<string, Record<string, DraftRecord>>
  >({});

  // Save flow
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [activeSaveDate, setActiveSaveDate] = useState("");

  // Excused reason popover: keyed by `${studentId}_${dateISO}`
  const [excusedPopover, setExcusedPopover] = useState<string | null>(null);

  const weekDates = Array.from({ length: 7 }, (_, i) =>
    toISO(addDays(weekStart, i)),
  );
  const termStart = effectiveTerm?.startDate ?? "";
  const termEnd = effectiveTerm?.endDate ?? "";
  const weekEnd = weekDates[6];

  // The students enrolled in the subject for the class, and the registers already saved this week
  const { enrolledStudents, savedDocs, copySavedAt } = useSubjectRegisterReads(
    institutionId,
    selectedSubjectId,
    selectedClassId,
    weekDates[0],
    weekEnd,
  );

  // ── Purge expired general attendance drafts on mount ──
  useEffect(() => {
    if (termStart) purgeExpiredDrafts(termStart);
  }, [termStart]);

  // ── Restore drafts when week or subject+class changes ──
  useEffect(() => {
    if (!selectedSubjectId || !selectedClassId || !institutionId) return;
    const restored: Record<string, Record<string, DraftRecord>> = {};
    for (const dateISO of weekDates) {
      restored[dateISO] = getSubjectDraft(
        institutionId,
        selectedSubjectId,
        selectedClassId,
        dateISO,
      );
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

  const canGoBack = termStart
    ? toISO(addDays(weekStart, -7)) >= termStart
    : false;
  const canGoNext = toISO(addDays(weekStart, 7)) <= today;

  // ── Cell interaction ──
  function handleCellChange(
    dateISO: string,
    studentId: string,
    state: AttendanceState,
  ) {
    if (!selectedSubjectId || !selectedClassId || !institutionId) return;
    const existing = draft[dateISO]?.[studentId];
    const record: DraftRecord = {
      state,
      reason: state === "E" ? (existing?.reason ?? "") : undefined,
    };
    // Merges into prev[dateISO], not a `current` captured from this render:
    // the bulk Fill calls this once per student in one synchronous pass, and a
    // captured snapshot would let each call overwrite the one before it, leaving
    // only the last student filled in state (the localStorage draft is unaffected).
    setDraftState((prev) => ({
      ...prev,
      [dateISO]: { ...prev[dateISO], [studentId]: record },
    }));
    setSubjectDraftCell(
      institutionId,
      selectedSubjectId,
      selectedClassId,
      dateISO,
      studentId,
      record,
    );

    if (state === "E") {
      setExcusedPopover(`${studentId}_${dateISO}`);
    } else if (excusedPopover?.startsWith(studentId)) {
      setExcusedPopover(null);
    }
  }

  function handleReasonChange(
    dateISO: string,
    studentId: string,
    reason: string,
  ) {
    if (!selectedSubjectId || !selectedClassId || !institutionId) return;
    const record: DraftRecord = { state: "E", reason };
    setDraftState((prev) => ({
      ...prev,
      [dateISO]: { ...prev[dateISO], [studentId]: record },
    }));
    setSubjectDraftCell(
      institutionId,
      selectedSubjectId,
      selectedClassId,
      dateISO,
      studentId,
      record,
    );
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
    return effectiveRecordOf(draft, savedDocs, dateISO, studentUid);
  }

  // ── Bulk fill: the "Fill" button in a date column's header ──
  // Picks a state for every enrolled student with no state yet on that date, or
  // (the dialog's "Overwrite all") for every student. It goes through the same
  // handleCellChange as a hand click, so the Save buttons and the "save anyway?"
  // warning treat filled cells exactly like marked ones. Excused is not offered:
  // it needs a reason per student (lib/attendanceMissing.ts).
  const [fillPickerDate, setFillPickerDate] = useState<string | null>(null);
  const [fillConfirm, setFillConfirm] = useState<{
    dateISO: string;
    state: AttendanceState;
    emptyCount: number;
    markedCount: number;
    excusedCount: number;
  } | null>(null);

  // The dialog always opens, so a date that was filled before can be overwritten instead of nothing happening.
  // Nobody already marked with the chosen state is counted or changed.
  const stateOn = (dateISO: string) => (uid: string) =>
    effectiveRecord(dateISO, uid)?.state;
  function handleFillPick(dateISO: string, state: AttendanceState) {
    setFillPickerDate(null);
    if (enrolledStudents.length === 0) return;
    const counts = fillCounts(enrolledStudents, stateOn(dateISO), state);
    setFillConfirm({ dateISO, state, ...counts });
  }

  function commitFill(mode: FillMode) {
    if (!fillConfirm) return;
    const { dateISO, state } = fillConfirm;
    for (const student of studentsToFill(
      enrolledStudents,
      stateOn(dateISO),
      mode,
      state,
    )) {
      handleCellChange(dateISO, student.uid, state);
    }
    setFillConfirm(null);
  }

  // ── Save flow ──
  async function commitSave(dateISO: string) {
    if (
      !user ||
      !selectedSubjectId ||
      !selectedClassId ||
      !institutionId ||
      !effectiveTerm ||
      !effectiveYear
    )
      return;

    setSavingDate(dateISO);
    setSaveError(null);

    try {
      const existingDoc = savedDocs.find((d) => d.sessionDate === dateISO);

      const records = buildSubjectRecords(enrolledStudents, (uid) =>
        effectiveRecord(dateISO, uid),
      );

      await saveSubjectRegister({
        institutionId,
        uid: user.uid,
        performedByName: actorName(
          displayName,
          user.email,
          staffFallback(role),
        ),
        existingDocId: existingDoc?.id ?? null,
        savedRecords: existingDoc?.records,
        subjectId: selectedSubjectId,
        subjectName: selectedSubject?.name ?? "",
        classId: selectedClassId,
        className: selectedClassName,
        dateISO,
        termId: effectiveTerm.id,
        academicYearId: effectiveYear.id,
        records,
      });

      clearSubjectDraft(
        institutionId,
        selectedSubjectId,
        selectedClassId,
        dateISO,
      );
      setSaveAttempted(false);
      setSaveSuccess(`Session register for ${formatDateLabel(dateISO)} saved.`);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch {
      setSaveError("Save failed. Check your connection and try again.");
    } finally {
      setSavingDate(null);
    }
  }

  function handleSave(dateISO: string) {
    const emptyCount = enrolledStudents.filter(
      (s) => !effectiveRecord(dateISO, s.uid),
    ).length;

    if (emptyCount === 0) {
      commitSave(dateISO);
      return;
    }
    if (!saveAttempted) {
      setSaveAttempted(true);
      setSaveError(
        `${emptyCount} student(s) have no attendance recorded. Save again to confirm.`,
      );
      setActiveSaveDate(dateISO);
      return;
    }
    setActiveSaveDate(dateISO);
    setConfirmDialogOpen(true);
  }

  // ── Derived values (computed before render guards so hooks stay unconditional) ──
  const savedDates = new Set(savedDocs.map((d) => d.sessionDate));

  const isReadOnly =
    !effectiveTerm || weekDates[0] > termEnd || weekDates[6] < termStart;
  // isReadOnly means "this week is outside the term" (and drives the notice above
  // the grid). viewOnly also covers a role that may not write at all (a spectator),
  // which sees the saved registers with no cell buttons, fill, or save controls.
  const viewOnly = isReadOnly || !canWrite(role);

  const sessionDates = sessionDatesOf(
    weekDates,
    selectedSubject,
    effectiveYear,
    termStart,
    effectiveNonSchoolDays,
  );

  const hasNoSchedule = !!selectedSubject && !selectedSubject.frequency;

  // ── Render ──
  if (USE_MOCK)
    return (
      <InfoState message="Subject Attendance Register is not available in demo mode." />
    );
  if (calTimedOut)
    return (
      <InfoState message="Something went wrong. Please contact your administrator." />
    );
  if (calLoading) return <Spinner />;
  if (!effectiveYear || !effectiveTerm) {
    return (
      <InfoState
        message={
          isCustomMode
            ? "No active time block is configured. Set up a Time Block first."
            : "No active academic term is configured. Set up the Academic Calendar first."
        }
      />
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header + selectors */}
      <RegisterHeader
        isCustomMode={isCustomMode}
        selectedBlock={selectedBlock}
        setSelectedBlockTermId={setSelectedBlockTermId}
        activeTimeBlocks={activeTimeBlocks}
        selectedSubjectId={selectedSubjectId}
        setSelectedSubjectId={setSelectedSubjectId}
        subjects={subjects}
        selectedSubject={selectedSubject}
        selectedClassName={selectedClassName}
        showClassSelector={showClassSelector}
        selectedClassId={selectedClassId}
        setSelectedClassId={setSelectedClassId}
        classesForDropdown={classesForDropdown}
        setSaveAttempted={setSaveAttempted}
        setSaveError={setSaveError}
      />

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
      {selectedSubject &&
        !hasNoSchedule &&
        showClassSelector &&
        !selectedClassId && (
          <InfoState message="Select a class above to view the register." />
        )}

      {/* Main register content */}
      {selectedSubject && !hasNoSchedule && selectedClassId && (
        <>
          <CopyNotice savedAt={copySavedAt} />

          {/* Week navigator */}
          <WeekNavigator
            prevWeek={prevWeek}
            nextWeek={nextWeek}
            canGoBack={canGoBack}
            canGoNext={canGoNext}
            weekDates={weekDates}
            isReadOnly={isReadOnly}
          />

          {sessionDates.length === 0 && (
            <InfoState message="No sessions scheduled for this week. Use the navigation to find a week with sessions." />
          )}

          {sessionDates.length > 0 && enrolledStudents.length === 0 && (
            <InfoState message="No students are enrolled in this subject for this class." />
          )}

          {/* Register grid */}
          {sessionDates.length > 0 && enrolledStudents.length > 0 && (
            <RegisterGrid
              sessionDates={sessionDates}
              enrolledStudents={enrolledStudents}
              today={today}
              savedDates={savedDates}
              savedDocs={savedDocs}
              draft={draft}
              viewOnly={viewOnly}
              fillPickerDate={fillPickerDate}
              setFillPickerDate={setFillPickerDate}
              handleFillPick={handleFillPick}
              saveAttempted={saveAttempted}
              activeSaveDate={activeSaveDate}
              excusedPopover={excusedPopover}
              setExcusedPopover={setExcusedPopover}
              handleCellChange={handleCellChange}
              handleReasonChange={handleReasonChange}
            />
          )}

          {/* Save controls — one per past/present session date */}
          {!viewOnly &&
            enrolledStudents.length > 0 &&
            sessionDates.length > 0 && (
              <SaveButtons
                sessionDates={sessionDates}
                today={today}
                draft={draft}
                savedDocs={savedDocs}
                savingDate={savingDate}
                handleSave={handleSave}
              />
            )}

          {/* Status messages — below save controls */}
          <SaveMessages
            saveSuccess={saveSuccess}
            saveError={saveError}
            saveAttempted={saveAttempted}
            setConfirmDialogOpen={setConfirmDialogOpen}
          />
        </>
      )}

      <FillConfirmDialog
        pending={
          fillConfirm
            ? {
                description: formatDateLabel(fillConfirm.dateISO),
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

      {/* Confirm dialog */}
      {confirmDialogOpen && (
        <ConfirmSaveDialog
          enrolledStudents={enrolledStudents}
          activeSaveDate={activeSaveDate}
          effectiveRecord={effectiveRecord}
          setConfirmDialogOpen={setConfirmDialogOpen}
          setSaveAttempted={setSaveAttempted}
          setSaveError={setSaveError}
          commitSave={commitSave}
        />
      )}
    </div>
  );
}
