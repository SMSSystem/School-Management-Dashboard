import { isSchoolDay } from '@/lib/attendanceCalendar';
import type { AttendanceState } from '@/lib/attendanceStates';
import FillColumnButton from '@/components/attendance/FillColumnButton';
import { AttendanceStateButton, STATE_CLASS } from '@/components/attendance/AttendanceStateButton';
import { ExcusedReasonPopover } from '@/components/attendance/ExcusedReasonPopover';
import {
  formatDateLabel,
  formatDayLabel,
  type DraftKey,
  type DraftStore,
  type SavedRegister,
  type Session,
  type StudentRow,
} from '@/lib/generalAttendanceLogic';
import type { NonSchoolDayDocument } from '@/types/institution';
import { InfoState } from '@/components/attendance/RegisterNotices';

// The register: a row per student, AM and PM columns for each day of the week, the fill buttons in the
// column headers, and the empty states for no class or no students.
export function RegisterGrid({
  effectiveClassId,
  students,
  weekDates,
  effectiveYear,
  effectiveNonSchoolDays,
  viewOnly,
  isCellDisabled,
  isOverdue,
  fillPickerKey,
  setFillPickerKey,
  handleFillPick,
  draft,
  savedDocs,
  saveAttempted,
  handleCellChange,
  excusedPopover,
  setExcusedPopover,
  handleReasonChange,
}: {
  effectiveClassId: string;
  students: StudentRow[];
  weekDates: string[];
  effectiveYear: { schoolWeekDays: number[] } | null;
  effectiveNonSchoolDays: NonSchoolDayDocument[];
  viewOnly: boolean;
  isCellDisabled: (dateISO: string) => boolean;
  isOverdue: (dateISO: string, session: Session) => boolean;
  fillPickerKey: DraftKey | null;
  setFillPickerKey: (update: DraftKey | null | ((prev: DraftKey | null) => DraftKey | null)) => void;
  handleFillPick: (dateISO: string, session: Session, state: AttendanceState) => void;
  draft: DraftStore;
  savedDocs: SavedRegister[];
  saveAttempted: boolean;
  handleCellChange: (dateISO: string, session: Session, studentId: string, state: AttendanceState) => void;
  excusedPopover: string | null;
  setExcusedPopover: (key: string | null) => void;
  handleReasonChange: (dateISO: string, session: Session, studentId: string, reason: string) => void;
}) {
  return (
    <>
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
                  const columnDisabled = viewOnly || isCellDisabled(dateISO);
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
                          {viewOnly ? (
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
    </>
  );
}
