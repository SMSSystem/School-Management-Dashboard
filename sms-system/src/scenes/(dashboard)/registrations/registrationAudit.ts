import { addDoc } from "firebase/firestore";
import { institutionCollection } from "@/lib/paths";

export async function logRegistrationAudit(
  institutionId: string,
  registrationId: string,
  studentName: string,
  detail: string,
  performedBy: string,
  performedByName: string,
) {
  await addDoc(institutionCollection(institutionId, "audit_log"), {
    eventType: "registration_status_change",
    detail,
    targetUid: registrationId,
    targetName: studentName,
    performedBy,
    performedByName,
    timestamp: new Date().toISOString(),
    institutionId,
  });
}
