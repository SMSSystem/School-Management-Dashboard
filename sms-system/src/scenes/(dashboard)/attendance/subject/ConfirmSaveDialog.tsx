import MissingStudentsList from '@/components/attendance/MissingStudentsList';
import { missingBySession } from '@/lib/attendanceMissing';
import { formatDateLabel, type StudentRow } from '@/lib/generalAttendanceLogic';

// "Some students still have no attendance state. Save anyway?" for the date being saved.
export function ConfirmSaveDialog({
  enrolledStudents,
  activeSaveDate,
  effectiveRecord,
  setConfirmDialogOpen,
  setSaveAttempted,
  setSaveError,
  commitSave,
}: {
  enrolledStudents: StudentRow[];
  activeSaveDate: string;
  effectiveRecord: (dateISO: string, studentUid: string) => { state: string; reason?: string } | undefined;
  setConfirmDialogOpen: (open: boolean) => void;
  setSaveAttempted: (attempted: boolean) => void;
  setSaveError: (error: string | null) => void;
  commitSave: (dateISO: string) => Promise<void>;
}) {
  return (
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
  );
}
