// Pure logic behind the student dashboard's "next class" card. Timetable slots
// are weekly-recurring (days + startTime + duration), so the next occurrence has
// to be computed from them, limited to each slot's term and skipping
// non-school days.

const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export type SlotLite = {
  id: string;
  termId: string;
  subjectName: string;
  teacherName?: string;
  room?: string;
  days: string[];
  startTime: string; // "HH:mm"
  duration: number; // minutes
};

// Inclusive ISO "YYYY-MM-DD" bounds.
export type DateRange = { start: string; end: string };

export type UpcomingClass = {
  slotId: string;
  subjectName: string;
  teacherName?: string;
  room?: string;
  start: Date;
  end: Date;
  inProgress: boolean;
  // "Today" | "Tomorrow" | e.g. "Mon, Oct 6"
  dayLabel: string;
};

function isoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function inRange(iso: string, r: DateRange): boolean {
  return iso >= r.start && iso <= r.end;
}

export function dayLabel(date: Date, now: Date): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatClassTime(start: Date, end: Date): string {
  const opts: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleTimeString(undefined, opts)} – ${end.toLocaleTimeString(undefined, opts)}`;
}

// The next `limit` class occurrences at or after `now` (a class already under
// way counts, flagged inProgress). Looks `horizonDays` ahead, which comfortably
// covers a week plus a holiday gap.
export function upcomingClasses(
  slots: SlotLite[],
  termRanges: Record<string, DateRange>,
  nonSchoolDays: DateRange[],
  now: Date,
  limit = 4,
  horizonDays = 14,
): UpcomingClass[] {
  const found: UpcomingClass[] = [];

  for (let offset = 0; offset <= horizonDays; offset++) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
    const iso = isoDate(day);
    if (nonSchoolDays.some((r) => inRange(iso, r))) continue;
    const key = DAY_KEYS[day.getDay()];

    for (const slot of slots) {
      if (!slot.days.includes(key)) continue;
      const term = termRanges[slot.termId];
      if (term && !inRange(iso, term)) continue;
      const [h, m] = slot.startTime.split(':').map(Number);
      if (Number.isNaN(h) || Number.isNaN(m)) continue;
      const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
      const end = new Date(start.getTime() + slot.duration * 60_000);
      if (end.getTime() <= now.getTime()) continue; // already over
      found.push({
        slotId: slot.id,
        subjectName: slot.subjectName,
        teacherName: slot.teacherName,
        room: slot.room,
        start,
        end,
        inProgress: start.getTime() <= now.getTime(),
        dayLabel: dayLabel(start, now),
      });
    }
  }

  return found.sort((a, b) => a.start.getTime() - b.start.getTime()).slice(0, limit);
}
