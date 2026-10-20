import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** Records that this person finished or skipped a walkthrough, so it is not offered again. */
export async function markTourSeen(uid: string, tourName: string) {
  await updateDoc(doc(db, "users", uid), {
    [`toursCompleted.${tourName}`]: true,
  });
}
