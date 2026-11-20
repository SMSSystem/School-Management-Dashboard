import { WaitingNotice } from '@/components/attendance/RegisterNotices';
import { useOffline } from '@/hooks/useOffline';
import { saveButtonLabel, savingLabel } from '@/lib/offline/copyLabels';
import {
  formatDateLabel,
  type DraftKey,
  type SavedRegister,
  type Session,
  type StudentRow,
} from '@/lib/generalAttendanceLogic';

// Save All, one Save button per drafted session, and the success, warning and summary messages below them.
export function SaveControls({
  viewOnly,
  effectiveClassId,
  students,
  populatedSessions,
  handleSaveAll,
  savingAll,
  savingKey,
  schoolDays,
  sessionHasDraft,
  savedDocs,
  handleSave,
  saveSuccess,
  saveError,
  saveAttempted,
  setConfirmDialogOpen,
  summaryWarning,
  setSummaryWarning,
  outboxStateOf,
}: {
  viewOnly: boolean;
  effectiveClassId: string;
  students: StudentRow[];
  populatedSessions: { dateISO: string; session: Session; emptyCount: number }[];
  handleSaveAll: (populated: { dateISO: string; session: Session; emptyCount: number }[]) => void;
  savingAll: boolean;
  savingKey: DraftKey | null;
  schoolDays: string[];
  sessionHasDraft: (key: DraftKey) => boolean;
  savedDocs: SavedRegister[];
  handleSave: (dateISO: string, session: Session) => void;
  saveSuccess: string | null;
  saveError: string | null;
  saveAttempted: boolean;
  setConfirmDialogOpen: (open: boolean) => void;
  summaryWarning: string | null;
  setSummaryWarning: (message: string | null) => void;
  /** The outbox's state for a session whose save is queued (slice C), or null. */
  outboxStateOf: (dateISO: string, session: Session) => 'pending' | 'sending' | null;
}) {
  const offline = useOffline();
  return (
    <>
      {/* Save All — only worth showing once there's more than one session to batch */}
      {!viewOnly && effectiveClassId && students.length > 0 && populatedSessions.length > 1 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => handleSaveAll(populatedSessions)}
            disabled={savingAll || savingKey !== null}
            className="text-xs font-semibold rounded-md px-3 py-1.5 bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {savingAll ? savingLabel(offline, 'Saving All…') : `Save All (${populatedSessions.length})`}
          </button>
        </div>
      )}

      {/* Save controls — one per school day × session */}
      {!viewOnly && effectiveClassId && students.length > 0 && (
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
                  {saveButtonLabel({
                    name: `${session} ${formatDateLabel(dateISO)}`,
                    saving,
                    offline,
                    queued: outboxStateOf(dateISO, session),
                    isSaved,
                    hasDraft,
                  })}
                </button>
              );
            })
          )}
        </div>
      )}

      <WaitingNotice saving={savingAll || savingKey !== null} />

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
    </>
  );
}
