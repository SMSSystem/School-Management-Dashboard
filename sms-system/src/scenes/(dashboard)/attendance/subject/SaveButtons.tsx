import { formatDateLabel } from '@/lib/generalAttendanceLogic';
import type { DraftRecord } from '@/lib/attendanceDraft';
import type { SubjectAttendanceDoc } from '@/lib/subjectAttendanceLogic';

// One Save button per past or present session date that has a draft (or is being saved).
export function SaveButtons({
  sessionDates,
  today,
  draft,
  savedDocs,
  savingDate,
  handleSave,
}: {
  sessionDates: string[];
  today: string;
  draft: Record<string, Record<string, DraftRecord>>;
  savedDocs: SubjectAttendanceDoc[];
  savingDate: string | null;
  handleSave: (dateISO: string) => void;
}) {
  return (
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
  );
}
