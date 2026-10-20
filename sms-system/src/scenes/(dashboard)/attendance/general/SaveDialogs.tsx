import MissingStudentsList from '@/components/attendance/MissingStudentsList';
import { missingBySession, type SessionMissing } from '@/lib/attendanceMissing';
import type { AttendanceState } from '@/lib/attendanceStates';
import { formatDateLabel, type Session, type StudentRow } from '@/lib/generalAttendanceLogic';

// The two confirmations before saving registers that still have unmarked students: one session, and Save All.
export function SaveDialogs({
  confirmDialogOpen,
  setConfirmDialogOpen,
  setSaveAttempted,
  setSaveError,
  commitSave,
  activeDate,
  activeSession,
  students,
  effectiveRecord,
  saveAllConfirmOpen,
  setSaveAllConfirmOpen,
  saveAllMissing,
  setSaveAllMissing,
  saveAllPending,
  setSaveAllPending,
  commitSaveAll,
}: {
  confirmDialogOpen: boolean;
  setConfirmDialogOpen: (open: boolean) => void;
  setSaveAttempted: (attempted: boolean) => void;
  setSaveError: (message: string | null) => void;
  commitSave: (dateISO: string, session: Session) => Promise<void>;
  activeDate: string;
  activeSession: Session;
  students: StudentRow[];
  effectiveRecord: (dateISO: string, session: Session, studentUid: string) => { state: AttendanceState; reason?: string } | undefined;
  saveAllConfirmOpen: boolean;
  setSaveAllConfirmOpen: (open: boolean) => void;
  saveAllMissing: SessionMissing[];
  setSaveAllMissing: (missing: SessionMissing[]) => void;
  saveAllPending: { dateISO: string; session: Session }[];
  setSaveAllPending: (pending: { dateISO: string; session: Session }[]) => void;
  commitSaveAll: (sessions: { dateISO: string; session: Session }[]) => Promise<void>;
}) {
  return (
    <>
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
    </>
  );
}
