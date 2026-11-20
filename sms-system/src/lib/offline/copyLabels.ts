// Wording for the register pages' offline notices (components/attendance/RegisterNotices.tsx).

/** "14:05", or "Tue 18 Nov, 14:05" for an earlier day. */
export function copyTimeLabel(savedAt: number, now: Date = new Date()): string {
  const at = new Date(savedAt);
  const time = at.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  if (at.toDateString() === now.toDateString()) return time;
  return `${at.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}, ${time}`;
}

/** The label of a Save button while its save is under way. */
export function savingLabel(offline: boolean, online = "Saving…"): string {
  return offline ? "Waiting for connection…" : online;
}
