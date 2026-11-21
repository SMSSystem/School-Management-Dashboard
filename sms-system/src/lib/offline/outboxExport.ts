// How unsent register saves (outboxStore.ts) read to a person (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md,
// slice C2): a label for each register, and a CSV of every student change, so work can be kept on paper or re-entered
// when it can't be sent. Pure: the page loads the spreadsheet code only when Export is clicked, so the header stays
// small.

import {
  ATTENDANCE_STATE_LABELS,
  type AttendanceState,
} from "@/lib/attendanceStates";
import type { ExportColumn } from "@/lib/spreadsheetExport";
import type { OutboxItem } from "./outboxStore";
import type { Mark } from "./registerCommands";
import { isExpired } from "./outboxPolicy";
import { clashLabel } from "./copyLabels";

const markName = (mark: Mark | undefined): string =>
  mark
    ? (ATTENDANCE_STATE_LABELS[mark.state as AttendanceState] ?? mark.state)
    : "No mark";

/** "General, Form 2A, 2026-11-20, AM" or "Maths, Form 2A, 2026-11-20". */
export function registerLabel(item: OutboxItem): string {
  const f = item.payload.fields;
  return item.payload.kind === "register.general"
    ? ["General", f.className, f.date, f.session].filter(Boolean).join(", ")
    : [f.subjectName ?? "Subject", f.className, f.sessionDate]
        .filter(Boolean)
        .join(", ");
}

/** Where an item stands, in plain words, for the tray. */
export function statusLabel(item: OutboxItem, now: number): string {
  if (item.state === "conflict")
    return clashLabel(Object.keys(item.payload.clash ?? {}).length);
  if (item.state === "refused")
    return `Not accepted. ${item.payload.refusedReason ?? ""}`.trim();
  if (isExpired(item, now)) return "Not sent within 7 days.";
  return item.state === "sending" ? "Sending…" : "Waiting to send.";
}

/** Whether an item needs the person: a clash, a refusal or an expiry. */
export const needsAttention = (item: OutboxItem, now: number): boolean =>
  item.state === "conflict" || item.state === "refused" || isExpired(item, now);

/** A student's name for the conflict dialog, from the marks themselves (the tray has no class list). */
export function clashNameOf(item: OutboxItem): (studentId: string) => string {
  return (studentId) => {
    const clash = item.payload.clash?.[studentId];
    return clash?.mine?.studentName ?? clash?.theirs?.studentName ?? studentId;
  };
}

export type OutboxExportRow = {
  register: string;
  student: string;
  mark: string;
  reason: string;
  was: string;
  queuedAt: string;
  state: string;
};

/** One row per student change, in the order the saves were made. */
export function outboxExportRows(items: OutboxItem[]): OutboxExportRow[] {
  return items.flatMap((item) => {
    const { changes, base } = item.payload.command;
    return Object.entries(changes).map(([studentId, mark]) => ({
      register: registerLabel(item),
      student: mark?.studentName ?? base[studentId]?.studentName ?? studentId,
      mark: markName(mark),
      reason: mark?.reason ?? "",
      was: markName(base[studentId]),
      queuedAt: new Date(item.createdAt).toISOString(),
      state: item.state,
    }));
  });
}

export const OUTBOX_EXPORT_COLUMNS: ExportColumn<OutboxExportRow>[] = [
  { header: "Register", accessor: (r) => r.register },
  { header: "Student", accessor: (r) => r.student },
  { header: "Mark", accessor: (r) => r.mark },
  { header: "Reason", accessor: (r) => r.reason },
  { header: "Previous mark", accessor: (r) => r.was },
  { header: "Queued at (UTC)", accessor: (r) => r.queuedAt },
  { header: "State", accessor: (r) => r.state },
];

/** `unsent-attendance-2026-11-20.csv`: no names or ids in the file name. */
export const outboxExportFilename = (now: number): string =>
  `unsent-attendance-${new Date(now).toISOString().slice(0, 10)}.csv`;

/** Downloads the CSV. The spreadsheet code is loaded only now. */
export async function downloadOutboxCsv(items: OutboxItem[]): Promise<void> {
  const { downloadCSV } = await import("@/lib/spreadsheetExport");
  downloadCSV(
    outboxExportFilename(Date.now()),
    outboxExportRows(items),
    OUTBOX_EXPORT_COLUMNS,
  );
}
