import { addDoc, serverTimestamp } from "firebase/firestore";
import { institutionCollection } from "@/lib/paths";
import type { buildRegistrationDocument } from "@/lib/registrationFormLogic";

// The one write of the public registration form (scenes/(auth)/register/[institutionId]): the pending
// registration an institution's admin reviews. The page keeps the checks before it and the message after a
// failure.
export async function submitRegistration(
  institutionId: string,
  registration: ReturnType<typeof buildRegistrationDocument>,
): Promise<void> {
  await addDoc(institutionCollection(institutionId, "enrollmentRegistrations"), {
    ...registration,
    submittedAt: serverTimestamp(),
  });
}
