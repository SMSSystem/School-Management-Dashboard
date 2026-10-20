import { writeBatch, doc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { ContactFormValues } from "@/lib/profileLogic";

// The one write of the profile page (scenes/(dashboard)/profile): a super admin's contact info, saved together
// with the activity-log entry that records it. The page keeps the checks before it, the error message after a
// failure and refreshing the profile.
export async function saveContactInfo({
  uid,
  institutionId,
  values,
  canonicalizePhone,
}: {
  uid: string;
  institutionId: string | null;
  values: ContactFormValues;
  canonicalizePhone: (value: string) => string;
}): Promise<void> {
  const batch = writeBatch(db);
  batch.update(doc(db, "users", uid), {
    name: values.name,
    phone: values.phone ? canonicalizePhone(values.phone) : "",
    emergencyContact: values.emergencyContact ?? "",
  });
  const logRef = doc(collection(db, "users", uid, "activity_log"));
  const logInstitutionId =
    institutionId === "*" ? "" : (institutionId ?? "");
  batch.set(logRef, {
    eventType: "profile_update",
    detail: "Contact info updated",
    timestamp: new Date().toISOString(),
    recordedAt: serverTimestamp(),
    uid,
    institutionId: logInstitutionId,
  });
  await batch.commit();
}
