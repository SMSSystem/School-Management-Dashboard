import { useEffect } from "react";
import { useNextStep } from "nextstepjs";
import { doc, getDoc } from "firebase/firestore";
import { db, UserDocument } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { onLoadError } from "@/lib/reportError";

const ROLES_WITH_REAL_TOURS = ['institution_admin'];

/** Starts the walkthrough for a role that has one, the first time that person signs in. */
export default function TourAutoTrigger({ stepsReady }: { stepsReady: boolean }) {
  const { user, role } = useAuth();
  const { startNextStep } = useNextStep();

  useEffect(() => {
    if (!stepsReady || !user || !role) return;
    if (!ROLES_WITH_REAL_TOURS.includes(role)) return;
    getDoc(doc(db, "users", user.uid)).then(
      (snap) => {
        const data = snap.data() as UserDocument | undefined;
        if (!data?.toursCompleted?.[role]) {
          startNextStep(role);
        }
      },
      // Only decides whether to offer the tour, so a failure is logged, not shown.
      onLoadError("your product tour settings", undefined, { quiet: true }),
    );
  }, [stepsReady, user, role, startNextStep]);

  return null;
}
