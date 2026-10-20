import { AttendanceStateButton, STATE_CLASS } from '@/components/attendance/AttendanceStateButton';
import { ExcusedReasonPopover } from '@/components/attendance/ExcusedReasonPopover';
import FillColumnButton from '@/components/attendance/FillColumnButton';
import type { DraftRecord } from '@/lib/attendanceDraft';
import type { AttendanceState } from '@/lib/attendanceStates';
import { formatDateLabel, formatDayLabel, type StudentRow } from '@/lib/generalAttendanceLogic';
import { isOverdueDate, type SubjectAttendanceDoc } from '@/lib/subjectAttendanceLogic';

// The register: one row per enrolled student, one column per session date, with the Overdue badge, the Fill
// button of each past or present date, and a cell button (or just the saved mark when the viewer cannot write).
export function RegisterGrid({
  sessionDates,
  enrolledStudents,
  today,
  savedDates,
  savedDocs,
  draft,
  viewOnly,
  fillPickerDate,
  setFillPickerDate,
  handleFillPick,
  saveAttempted,
  activeSaveDate,
  excusedPopover,
  setExcusedPopover,
  handleCellChange,
  handleReasonChange,
}: {
  sessionDates: string[];
  enrolledStudents: StudentRow[];
  today: string;
  savedDates: Set<string>;
  savedDocs: SubjectAttendanceDoc[];
  draft: Record<string, Record<string, DraftRecord>>;
  viewOnly: boolean;
  fillPickerDate: string | null;
  setFillPickerDate: (updater: string | null | ((prev: string | null) => string | null)) => void;
  handleFillPick: (dateISO: string, state: AttendanceState) => void;
  saveAttempted: boolean;
  activeSaveDate: string;
  excusedPopover: string | null;
  setExcusedPopover: (key: string | null) => void;
  handleCellChange: (dateISO: string, studentId: string, state: AttendanceState) => void;
  handleReasonChange: (dateISO: string, studentId: string, reason: string) => void;
}) {
  return (
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
                {!viewOnly && dateISO <= today && (
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
  );
}
