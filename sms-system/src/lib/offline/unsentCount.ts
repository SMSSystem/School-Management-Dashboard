// How many unsent register saves this person has (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C2). The
// tray (components/attendance/OutboxTray.tsx) is loaded on demand and keeps this up to date; the header reads it when
// Logout is clicked, so it can warn first without loading the outbox code itself.

let count = 0;

export function unsentCount(): number {
  return count;
}

export function setUnsentCount(next: number): void {
  count = next;
}
