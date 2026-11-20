import { writeRegisterDoc } from "@/lib/generalAttendanceSave";
import { actorName, staffFallback } from "@/lib/auditEntry";
import {
  generalTargetKey,
  queueGeneralSave,
} from "@/lib/offline/registerQueue";
import type { OutboxPayload } from "@/lib/offline/outboxStore";
import type { RegisterOutbox } from "@/hooks/useRegisterOutbox";

// One General register session's save (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C): queued in the
// outbox where the institution has it on, otherwise written straight to Firestore as before (writeRegisterDoc).
// "queued" means the page keeps its draft until the save is sent; the outbox clears it then (useRegisterOutbox).

type WriteParams = Parameters<typeof writeRegisterDoc>[0];

export async function saveSession(
  p: WriteParams & {
    outbox: RegisterOutbox;
    draftKey: string;
    draftSnapshot: string;
    summary: NonNullable<OutboxPayload["summary"]>;
  },
): Promise<"saved" | "queued"> {
  if (p.outbox.enabled) {
    const targetKey = generalTargetKey(
      p.institutionId,
      p.classId,
      p.dateISO,
      p.session,
    );
    const pending = p.outbox.pendingFor(targetKey);
    const result = await queueGeneralSave({
      institutionId: p.institutionId,
      classId: p.classId,
      className: p.className,
      termId: p.termId,
      academicYearId: p.academicYearId,
      dateISO: p.dateISO,
      session: p.session,
      saved: p.existingDoc,
      pending,
      records: p.records,
      actor: {
        uid: p.actor.uid,
        name: actorName(
          p.actor.displayName,
          p.actor.email,
          staffFallback(p.actor.role),
        ),
      },
      summary: p.summary,
    });
    if (result === "queued" || (result === "unchanged" && pending.length > 0)) {
      p.outbox.watch(targetKey, p.draftKey, p.draftSnapshot);
      return "queued";
    }
    if (result === "unchanged") return "saved";
  }
  await writeRegisterDoc(p);
  return "saved";
}
