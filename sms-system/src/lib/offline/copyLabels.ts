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

/** A register Save button's label, with the outbox's state when the register's save is queued (slice C). */
export function saveButtonLabel(p: {
  name: string;
  saving: boolean;
  offline: boolean;
  queued: "pending" | "sending" | null;
  isSaved: boolean;
  hasDraft: boolean;
}): string {
  if (p.saving) return savingLabel(p.offline);
  if (p.queued === "sending") return `Sending ${p.name}…`;
  if (p.queued === "pending") return `${p.name}: saved on this device`;
  return p.isSaved && !p.hasDraft ? `${p.name} ✓` : `Save ${p.name}`;
}

/** The message after a register save: "saved", or saved on this device when it went to the outbox (slice C). */
export function savedMessage(what: string, outcome: "saved" | "queued" | undefined): string {
  return outcome === "queued"
    ? `${what} saved on this device. It is sent when the connection allows.`
    : `${what} saved.`;
}
