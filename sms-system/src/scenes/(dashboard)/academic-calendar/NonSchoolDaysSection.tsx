import type { Dispatch, SetStateAction } from 'react';
import type { NonSchoolDayDocument } from '@/lib/firebase';
import { formatDate, type CustomNSD } from '@/lib/academicCalendarLogic';
import { DateInput, Label, TextInput } from './CalendarFields';

// The management view's non-school days: the add form, the public holidays and the other dates.

export function NonSchoolDaysSection({
  mayEdit,
  addingNSD,
  setAddingNSD,
  newNSD,
  setNewNSD,
  nsdError,
  addNSD,
  allNonSchoolDays,
  toggleNSD,
}: {
  mayEdit: boolean;
  addingNSD: boolean;
  setAddingNSD: (adding: boolean) => void;
  newNSD: Omit<CustomNSD, 'id'>;
  setNewNSD: Dispatch<SetStateAction<Omit<CustomNSD, 'id'>>>;
  nsdError: string | null;
  addNSD: () => Promise<void>;
  allNonSchoolDays: (NonSchoolDayDocument & { id: string })[];
  toggleNSD: (nsd: NonSchoolDayDocument & { id: string }) => Promise<void>;
}) {
  return (
    <section>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-200">Non-School Days</h2>
        {mayEdit && (
          <button id="tour-academic-calendar-nsd-add" type="button" onClick={() => setAddingNSD(true)} className="text-xs text-sky-600 hover:underline">
            + Add
          </button>
        )}
      </div>

      {addingNSD && (
        <div className="mb-4 border border-gray-200 dark:border-gray-700 rounded-md p-4 space-y-3">
          <div className="flex gap-2">
            {(['single', 'range'] as const).map((t) => (
              <button
                key={t}
                id={`tour-academic-calendar-nsd-new-type-${t}`}
                type="button"
                onClick={() => setNewNSD((prev) => ({ ...prev, type: t }))}
                className={`px-3 py-1 text-xs rounded-full border ${newNSD.type === t ? 'bg-sky-500 text-white border-sky-500' : 'border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400'}`}
              >
                {t === 'single' ? 'Single date' : 'Date range'}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {newNSD.type === 'single' ? (
              <Label>Date<DateInput id="tour-academic-calendar-nsd-new-date" value={newNSD.date} onChange={(v) => setNewNSD((p) => ({ ...p, date: v }))} /></Label>
            ) : (
              <>
                <Label>Start<DateInput id="tour-academic-calendar-nsd-new-start" value={newNSD.startDate} onChange={(v) => setNewNSD((p) => ({ ...p, startDate: v }))} /></Label>
                <Label>End<DateInput id="tour-academic-calendar-nsd-new-end" value={newNSD.endDate} onChange={(v) => setNewNSD((p) => ({ ...p, endDate: v }))} /></Label>
              </>
            )}
            <Label>
              Reason (max 100 chars)
              <TextInput id="tour-academic-calendar-nsd-new-reason" value={newNSD.reason} onChange={(v) => setNewNSD((p) => ({ ...p, reason: v.slice(0, 100) }))} placeholder="e.g. School sports day" maxLength={100} />
            </Label>
          </div>
          {nsdError && <p className="text-xs text-red-500">{nsdError}</p>}
          <div className="flex gap-2">
            <button id="tour-academic-calendar-nsd-new-save" type="button" onClick={addNSD} className="text-xs font-medium text-sky-600 hover:underline">Save</button>
            <button id="tour-academic-calendar-nsd-new-cancel" type="button" onClick={() => setAddingNSD(false)} className="text-xs text-gray-500 hover:underline">Cancel</button>
          </div>
        </div>
      )}

      {(() => {
        const publicHolidays = allNonSchoolDays.filter((n) => n.source === 'public_holiday');
        const otherDates = allNonSchoolDays.filter((n) => n.source !== 'public_holiday');

        const renderNSDCard = (n: NonSchoolDayDocument & { id: string }) => (
          <div key={n.id} className={`flex items-center justify-between rounded-md border px-3 py-2 ${n.isActive ? 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-950' : 'border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 opacity-60'}`}>
            <div>
              <span className="text-sm text-gray-900 dark:text-gray-100">{n.reason}</span>
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                {n.type === 'single' ? formatDate(n.date ?? '') : `${formatDate(n.startDate ?? '')} → ${formatDate(n.endDate ?? '')}`}
              </span>
            </div>
            {mayEdit && (
              <button
                id={`tour-academic-calendar-nsd-toggle-${n.id}`}
                type="button"
                onClick={() => toggleNSD(n)}
                className="text-xs text-sky-600 hover:underline ml-3 shrink-0"
              >
                {n.isActive ? 'Deactivate' : 'Activate'}
              </button>
            )}
          </div>
        );

        return (
          <>
            <div className="space-y-1 mb-4">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Public Holidays</h3>
              {publicHolidays.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">No public holidays configured.</p>
              ) : (
                <div className="space-y-2">{publicHolidays.map(renderNSDCard)}</div>
              )}
            </div>
            <div className="space-y-1">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Other Dates</h3>
              {otherDates.length === 0 ? (
                <p className="text-xs text-gray-400 dark:text-gray-500">No other dates configured.</p>
              ) : (
                <div className="space-y-2">{otherDates.map(renderNSDCard)}</div>
              )}
            </div>
          </>
        );
      })()}
    </section>
  );
}
