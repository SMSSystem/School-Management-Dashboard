// Queuing a register save in the outbox (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C): the General
// and Subject register pages call these instead of writing to Firestore when their institution has the outbox on.
// The save is compared with what this person expects the server to hold (the saved register plus their own unsent
// changes), so only what changed is queued; the sender then sends it (outboxSender.ts).

import {
  generalRegisterId,
  subjectRegisterId,
  type RegisterRecord,
} from "@/lib/attendanceRegisters";
import {
  generalAttendanceDetail,
  subjectAttendanceDetail,
} from "@/lib/teacherAudit";
import {
  buildRegisterCommand,
  expectedRecords,
  type RegisterCommand,
} from "./registerCommands";
import { enqueueSave, type OutboxPayload } from "./outboxStore";
import { wakeOutbox } from "./outboxSender";

/** What happened to a save: queued, nothing had changed, or it couldn't be kept (no session key). */
export type QueueResult = "queued" | "unchanged" | "not-kept";

export const generalTargetKey = (
  institutionId: string,
  classId: string,
  dateISO: string,
  session: string,
) => `general|${institutionId}|${classId}|${dateISO}|${session}`;

export const subjectTargetKey = (
  institutionId: string,
  subjectId: string,
  classId: string,
  dateISO: string,
) => `subject|${institutionId}|${subjectId}|${classId}|${dateISO}`;

type Common = {
  institutionId: string;
  classId: string;
  className: string;
  termId: string;
  academicYearId: string;
  dateISO: string;
  /** The register already saved, if any: its id (a register saved before fixed ids keeps its own) and records. */
  saved: { id: string; records?: Record<string, RegisterRecord> } | undefined;
  /** This person's unsent commands for the same register, oldest first. */
  pending: RegisterCommand[];
  /** The whole register as it is on screen. */
  records: Record<string, RegisterRecord>;
  actor: { uid: string; name: string };
};

async function queue(
  payload: Omit<OutboxPayload, "schema" | "command" | "markedAt">,
  common: Common,
): Promise<QueueResult> {
  const command = buildRegisterCommand(
    expectedRecords(common.saved?.records, common.pending),
    common.records,
  );
  if (Object.keys(command.changes).length === 0) return "unchanged";
  const item = await enqueueSave({ ...payload, command, markedAt: Date.now() });
  if (!item) return "not-kept";
  void wakeOutbox();
  return "queued";
}

/** Queues one General register session. */
export function queueGeneralSave(
  p: Common & {
    session: string;
    summary: NonNullable<OutboxPayload["summary"]>;
  },
): Promise<QueueResult> {
  return queue(
    {
      kind: "register.general",
      institutionId: p.institutionId,
      docId: p.saved?.id ?? generalRegisterId(p.classId, p.dateISO, p.session),
      targetKey: generalTargetKey(
        p.institutionId,
        p.classId,
        p.dateISO,
        p.session,
      ),
      fields: {
        classId: p.classId,
        className: p.className,
        termId: p.termId,
        academicYearId: p.academicYearId,
        date: p.dateISO,
        session: p.session,
      },
      actor: p.actor,
      audit: {
        eventType: "attendance_edit",
        detail: generalAttendanceDetail({
          className: p.className,
          dateISO: p.dateISO,
          session: p.session,
          recorded: Object.keys(p.records).length,
        }),
        targetUid: p.classId,
        targetName: p.className,
      },
      summary: p.summary,
    },
    p,
  );
}

/** Queues one Subject register date. */
export function queueSubjectSave(
  p: Common & { subjectId: string; subjectName: string },
): Promise<QueueResult> {
  return queue(
    {
      kind: "register.subject",
      institutionId: p.institutionId,
      docId:
        p.saved?.id ?? subjectRegisterId(p.subjectId, p.classId, p.dateISO),
      targetKey: subjectTargetKey(
        p.institutionId,
        p.subjectId,
        p.classId,
        p.dateISO,
      ),
      fields: {
        subjectId: p.subjectId,
        subjectName: p.subjectName,
        classId: p.classId,
        className: p.className,
        sessionDate: p.dateISO,
        termId: p.termId,
        academicYearId: p.academicYearId,
      },
      actor: p.actor,
      audit: {
        eventType: "attendance_edit",
        detail: subjectAttendanceDetail({
          className: p.className,
          subjectName: p.subjectName,
          dateISO: p.dateISO,
          recorded: Object.keys(p.records).length,
        }),
        targetUid: p.classId,
        targetName: p.className,
      },
    },
    p,
  );
}
