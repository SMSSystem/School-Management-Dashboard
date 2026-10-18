import { Pencil } from 'lucide-react';
import type { ActiveTimeBlock } from '@/hooks/useInstitutionAcademicCalendar';
import { formatDate } from '@/lib/academicCalendarLogic';

// ─── Custom Time Blocks Summary (post-item-4/5 routing fix) ───────────────────
//
// activeYear/draftYear stay permanently null for calendarMode === 'custom'
// institutions (§3.1's deliberate singular/plural split) — without a
// dedicated branch, AcademicCalendarPage's existing "no active year and no
// draft → show the create wizard" check would be true forever, even after a
// time block already exists. Shows a read-only list of every active block,
// plus the quick-create trigger above. Per-block editing is limited to
// session days (EditTimeBlockDaysModal, above) — a full management view
// (editing name/dates, non-school days, etc. — the custom-mode equivalent
// of AcademicCalendarManagementView) remains out of scope.
export function CustomTimeBlocksSummaryView({
  blocks,
  onCreateAnother,
  onEditBlock,
}: {
  blocks: ActiveTimeBlock[];
  // Omitted for a read-only role: the buttons below are then not rendered.
  onCreateAnother?: () => void;
  onEditBlock?: (block: ActiveTimeBlock) => void;
}) {
  return (
    <div className="p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Time Blocks</h1>
        {onCreateAnother && (
          <button
            type="button"
            onClick={onCreateAnother}
            className="rounded-md bg-sky-500 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-600"
          >
            + New Time Block
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3 max-w-2xl">
        {blocks.map((b) => (
          <div
            key={b.term.id}
            className="bg-white dark:bg-gray-950 rounded-lg border border-gray-200 dark:border-gray-800 p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{b.year.name}</p>
              {onEditBlock && (
                <button
                  type="button"
                  onClick={() => onEditBlock(b)}
                  title="Edit session days"
                  aria-label="Edit session days"
                  className="shrink-0 text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {formatDate(b.year.startDate)} → {formatDate(b.year.endDate)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
