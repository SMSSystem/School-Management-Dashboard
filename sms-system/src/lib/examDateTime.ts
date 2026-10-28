// How an exam's dates and times are written on screen (EXAMS_FEATURE_SPEC.md §4.5): "3:00 PM on April 14, 2026", in
// Jamaica time whatever the device's zone, so a student, a teacher and a parent read the same time. The words are put
// together here from the parts of Intl.DateTimeFormat, so the text never depends on the browser's own pattern (its seconds,
// its slashes, a narrow no-break space before PM). Pure: the device's zone is a parameter where it matters.

export const JAMAICA_TIME_ZONE = "America/Jamaica";

const PARTS = new Intl.DateTimeFormat("en-US", {
  timeZone: JAMAICA_TIME_ZONE,
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  month: "long",
  day: "numeric",
  year: "numeric",
});

type Parts = { time: string; date: string; day: string };

function partsOf(ms: number): Parts {
  const p: Record<string, string> = {};
  for (const part of PARTS.formatToParts(new Date(ms))) p[part.type] = part.value;
  const period = (p.dayPeriod ?? "").toUpperCase();
  const date = `${p.month} ${p.day}, ${p.year}`;
  return { time: `${p.hour}:${p.minute} ${period}`, date, day: date };
}

/** "3:00 PM on April 14, 2026". */
export function formatExamDateTime(ms: number): string {
  const p = partsOf(ms);
  return `${p.time} on ${p.date}`;
}

/** "3:00 PM" (Jamaica time). */
export function formatExamClock(ms: number): string {
  return partsOf(ms).time;
}

/** "Opens 3:00 PM on October 22, 2026, closes 5:00 PM the same day"; a missing time reads "—". */
export function formatExamWindow(opensMs: number | undefined, closesMs: number | undefined): string {
  const open = opensMs === undefined ? "—" : formatExamDateTime(opensMs);
  if (opensMs !== undefined && closesMs !== undefined && partsOf(opensMs).day === partsOf(closesMs).day) {
    return `Opens ${open}, closes ${partsOf(closesMs).time} the same day`;
  }
  return `Opens ${open}, closes ${closesMs === undefined ? "—" : formatExamDateTime(closesMs)}`;
}

/** The zone's offset from UTC in minutes at an instant (negative west of Greenwich). */
export function zoneOffsetMinutes(ms: number, timeZone: string): number {
  const p: Record<string, string> = {};
  const format = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    second: "numeric",
  });
  for (const part of format.formatToParts(new Date(ms))) p[part.type] = part.value;
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60000);
}

/**
 * "All times are Jamaica time." when the device is in a zone whose clock differs from Jamaica's now (Jamaica keeps UTC-5
 * all year, so zones are compared by offset: Bogota and Panama need no note), otherwise null.
 */
export function jamaicaTimeNote(deviceTimeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone, nowMs: number = Date.now()): string | null {
  try {
    return zoneOffsetMinutes(nowMs, deviceTimeZone) === zoneOffsetMinutes(nowMs, JAMAICA_TIME_ZONE) ? null : "All times are Jamaica time.";
  } catch {
    return null;
  }
}
