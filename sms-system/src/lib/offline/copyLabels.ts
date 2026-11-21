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
export function savedMessage(
  what: string,
  outcome: "saved" | "queued" | undefined,
): string {
  return outcome === "queued"
    ? `${what} saved on this device. It is sent when the connection allows.`
    : `${what} saved.`;
}

/** "1 student was changed by someone else." / "3 students were …", for a register waiting for a choice (slice C). */
export function clashLabel(count: number): string {
  return `${count} ${count === 1 ? "student was" : "students were"} changed by someone else.`;
}

const registers = (count: number) =>
  `${count} ${count === 1 ? "register" : "registers"}`;

/** The header's tray button: "1 unsent" (slice C2). */
export const unsentLabel = (count: number): string => `${count} unsent`;

/** The sign-out warning's first line (slice C2). */
export function signOutWarning(count: number): string {
  return `${registers(count)} ${count === 1 ? "hasn't" : "haven't"} been sent yet.`;
}

/** The toast at sign-in when work from an earlier session is waiting (slice C2). */
export function signInNotice(count: number, sending: boolean): string {
  const saves = `${count} register ${count === 1 ? "save" : "saves"} from your last session`;
  return sending
    ? `${saves} ${count === 1 ? "is" : "are"} being sent.`
    : `${saves} ${count === 1 ? "is" : "are"} waiting on this device. Sending is turned off for your school.`;
}

/** The tray button's name for screen readers: "1 unsent attendance register" (slice C2). */
export const unsentButtonName = (count: number): string =>
  `${count} unsent attendance ${count === 1 ? "register" : "registers"}`;

/** The sign-out warning's second line (slice C2). */
export function signOutDetail(count: number): string {
  return count === 1
    ? "It stays on this device, encrypted, for up to 7 days, and is sent when you sign in again on this device."
    : "They stay on this device, encrypted, for up to 7 days, and are sent when you sign in again on this device.";
}
