export type AttendanceSession = 'AM' | 'PM';

/** Converts a JS Date to Jamaica Standard Time (UTC-5, no DST). */
function toJST(date: Date): Date {
  return new Date(date.getTime() - 5 * 60 * 60 * 1000);
}

function totalMinutesUTC(date: Date): number {
  return date.getUTCHours() * 60 + date.getUTCMinutes();
}

const WINDOWS = {
  AM: { open: 8 * 60, close: 10 * 60 },
  PM: { open: 12 * 60, close: 14 * 60 },
} as const;

export function isSessionWindowClosed(session: AttendanceSession, now = new Date()): boolean {
  return totalMinutesUTC(toJST(now)) >= WINDOWS[session].close;
}
