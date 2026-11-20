import { saveSubjectRegister } from "@/lib/subjectAttendanceSave";
import {
  queueSubjectSave,
  subjectTargetKey,
} from "@/lib/offline/registerQueue";
import type { RegisterOutbox } from "@/hooks/useRegisterOutbox";

// One Subject register date's save (docs/miscellaneous-specs/OFFLINE_ATTENDANCE_SPEC.md, slice C): queued in the
// outbox where the institution has it on, otherwise written straight to Firestore as before (saveSubjectRegister).
// "queued" means the page keeps its draft until the save is sent; the outbox clears it then (useRegisterOutbox).

type SaveParams = Parameters<typeof saveSubjectRegister>[0];

export async function saveDate(
  p: SaveParams & { outbox: RegisterOutbox; draftSnapshot: string },
): Promise<"saved" | "queued"> {
  if (p.outbox.enabled) {
    const targetKey = subjectTargetKey(
      p.institutionId,
      p.subjectId,
      p.classId,
      p.dateISO,
    );
    const pending = p.outbox.pendingFor(targetKey);
    const result = await queueSubjectSave({
      institutionId: p.institutionId,
      subjectId: p.subjectId,
      subjectName: p.subjectName,
      classId: p.classId,
      className: p.className,
      termId: p.termId,
      academicYearId: p.academicYearId,
      dateISO: p.dateISO,
      saved: p.existingDocId
        ? { id: p.existingDocId, records: p.savedRecords }
        : undefined,
      pending,
      records: p.records,
      actor: { uid: p.uid, name: p.performedByName },
    });
    if (result === "queued" || (result === "unchanged" && pending.length > 0)) {
      p.outbox.watch(targetKey, p.dateISO, p.draftSnapshot);
      return "queued";
    }
    if (result === "unchanged") return "saved";
  }
  await saveSubjectRegister(p);
  return "saved";
}
