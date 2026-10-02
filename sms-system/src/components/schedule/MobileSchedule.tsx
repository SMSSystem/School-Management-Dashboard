import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { DoorOpen, UserRound } from 'lucide-react';
import {
  DAY_KEYS,
  DAY_LONG,
  DAY_SHORT,
  daysWithSlots,
  formatTimeRange,
  slotStatuses,
  slotsForDay,
  subjectColor,
  todayKey,
  type DayKey,
  type SlotLike,
} from '@/lib/scheduleDay';

type Props<T extends SlotLike> = {
  slots: T[];
  // Extra controls rendered under a slot (staff edit/delete).
  renderActions?: (slot: T) => ReactNode;
};

// Phone layout for the Schedule page: a Mon–Sat chip strip (today preselected,
// a dot on days that have classes) and the chosen day's classes as an agenda —
// time on the left, a coloured subject card on the right.
export default function MobileSchedule<T extends SlotLike>({ slots, renderActions }: Props<T>) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const today = todayKey(now);
  const [selected, setSelected] = useState<DayKey>(today);
  const withSlots = useMemo(() => daysWithSlots(slots), [slots]);
  const daySlots = useMemo(() => slotsForDay(slots, selected), [slots, selected]);
  const statuses = useMemo(
    () => (selected === today && now.getDay() !== 0 ? slotStatuses(daySlots, now) : {}),
    [selected, today, daySlots, now],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Day strip */}
      <div role="group" aria-label="Day of the week" className="grid grid-cols-6 gap-1.5">
        {DAY_KEYS.map((day) => {
          const active = day === selected;
          return (
            <button
              key={day}
              type="button"
              aria-pressed={active}
              aria-label={`${DAY_LONG[day]}${day === today ? ' (today)' : ''}${withSlots.has(day) ? ', has classes' : ''}`}
              onClick={() => setSelected(day)}
              className={`relative min-h-14 rounded-xl border text-center transition-colors ${
                active
                  ? 'bg-sky-600 border-sky-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200'
              }`}
            >
              <span className="block text-xs font-semibold">{DAY_SHORT[day]}</span>
              <span className="mt-1 flex justify-center">
                {withSlots.has(day) ? (
                  <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : 'bg-sky-500'}`} aria-hidden="true" />
                ) : (
                  <span className="h-1.5 w-1.5" aria-hidden="true" />
                )}
              </span>
              {day === today && (
                <span
                  className={`absolute inset-x-2 bottom-1 h-0.5 rounded-full ${active ? 'bg-white/70' : 'bg-sky-400'}`}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
        {DAY_LONG[selected]}
        {selected === today && <span className="ml-2 text-xs font-medium text-sky-600 dark:text-sky-400">Today</span>}
      </h2>

      {/* Agenda */}
      {daySlots.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 px-4 py-10 text-center">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-300">No classes on {DAY_LONG[selected]}</p>
          <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">Pick another day above.</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3" aria-label={`${DAY_LONG[selected]} classes`}>
          {daySlots.map((slot) => {
            const status = statuses[slot.id];
            const range = formatTimeRange(slot.startTime, slot.duration);
            const [startLabel, endLabel] = range.split(' – ');
            return (
              <li key={slot.id} className={`flex gap-3 ${status === 'done' ? 'opacity-60' : ''}`}>
                <div className="w-16 shrink-0 pt-3 text-right">
                  <div className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-tight">{startLabel}</div>
                  {endLabel && <div className="text-xs text-gray-400 dark:text-gray-500">{endLabel}</div>}
                </div>
                <div className={`min-w-0 flex-1 rounded-xl border-l-4 px-4 py-3 ${subjectColor(slot.subjectName)}`}>
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0 text-base font-semibold wrap-break-word">{slot.subjectName}</span>
                    {(status === 'now' || status === 'next') && (
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                          status === 'now' ? 'bg-emerald-600 text-white' : 'bg-sky-600 text-white'
                        }`}
                      >
                        {status === 'now' ? 'Now' : 'Next'}
                      </span>
                    )}
                  </div>
                  {(slot.teacherName || slot.room) && (
                    <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs opacity-80">
                      {slot.teacherName && (
                        <span className="inline-flex items-center gap-1">
                          <UserRound className="h-3.5 w-3.5" aria-hidden="true" />
                          {slot.teacherName}
                        </span>
                      )}
                      {slot.room && (
                        <span className="inline-flex items-center gap-1">
                          <DoorOpen className="h-3.5 w-3.5" aria-hidden="true" />
                          Room {slot.room}
                        </span>
                      )}
                    </div>
                  )}
                  {renderActions && <div className="mt-2 flex items-center gap-2">{renderActions(slot)}</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
