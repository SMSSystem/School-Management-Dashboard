import { logAuditEvent } from "@/lib/auditLog";

export async function logRegistrationAudit(
  institutionId: string,
  registrationId: string,
  studentName: string,
  detail: string,
  performedBy: string,
  performedByName: string,
) {
  await logAuditEvent({
    institutionId,
    eventType: "registration_status_change",
    detail,
    targetUid: registrationId,
    targetName: studentName,
    performedBy,
    performedByName,
  });
}
